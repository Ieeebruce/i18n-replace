import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';
import { config } from '../core/config';
import { info, warn } from '../util/logger';
import { setDictDir } from '../util/dict-reader';
import { processComponent, ComplexCase } from './component';
import { pruneUnused } from '../replace/prune';
import { collectVarAliases } from '../core/var-alias';
import { VarAlias } from '../types/var-alias';
import { processFile } from './processor';
import { IOError, ParseError, AstProcessingError } from '../util/errors';

// 读取和写入文件的辅助函数
function readFile(p: string): string { 
  try {
    return fs.readFileSync(p, 'utf8'); 
  } catch (error) {
    throw new IOError(`Failed to read file: ${p}`, p);
  }
} // 读取文本文件

let dryRun = !!config.dryRun // 干运行，从配置读取

function writeFile(p: string, s: string) { 
  if (!dryRun) {
    try {
      fs.writeFileSync(p, s, 'utf8'); 
    } catch (error) {
      throw new IOError(`Failed to write file: ${p}`, p);
    }
  }
} // 写出文本文件（支持 dry-run）

// 递归遍历目录并按过滤器收集文件
export function walk(dir: string, filter: (p: string) => boolean): string[] {
  const out: string[] = [] // 输出文件列表
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true }) // 读取目录条目
    for (const e of entries) { // 遍历条目
      if (e.name === 'node_modules' || e.name === '.git') continue // 忽略 node_modules 和 .git
      const full = path.join(dir, e.name) // 计算完整路径
      if (e.isDirectory()) out.push(...walk(full, filter)) // 目录则递归
      else if (filter(full)) out.push(full) // 文件且匹配过滤器则加入
    }
  } catch (error) {
    // 如果目录不存在或无法访问，返回空数组
    warn(`Could not read directory`, { dir, error: error instanceof Error ? error : new Error(String(error)) });
  }
  return out // 返回
}

// 用于计算行差异的辅助函数
function splitLines(s: string): string[] { return String(s || '').split(/\r?\n/) }
function diffLines(a: string, b: string): Array<{ line: number; before: string; after: string }> {
  const la = splitLines(a), lb = splitLines(b)
  const n = Math.max(la.length, lb.length)
  const out: Array<{ line: number; before: string; after: string }> = []
  for (let i = 0; i < n; i++) {
    const ba = la[i] ?? '', bb = lb[i] ?? ''
    if (ba !== bb) out.push({ line: i + 1, before: ba, after: bb })
  }
  return out
}

// 从字典目录加载语言字典的辅助函数
function loadLangDict(dictDir: string, langPrefix: string, arrayMode: 'nested'|'flat'): Record<string, any> {
  const dir = path.join(process.cwd(), dictDir)
  if (!fs.existsSync(dir)) return {}
  
  const re = new RegExp(`^${langPrefix}[A-Za-z0-9_-]*\\.ts$`)
  const files = fs.readdirSync(dir).filter(n => re.test(n))
  
  let out: Record<string, any> = {}
  for (const name of files) {
    const fp = path.join(dir, name)
    try {
      const content = fs.readFileSync(fp, 'utf8')
      // 使用正则表达式简单提取导出的对象内容
      const match = content.match(/export\s+const\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s+=\s+({[\s\S]*?})\s+(?:as\s+const)?\s*$/m)
      if (match) {
        try {
          // 安全地解析TS对象字面量，使用Function构造函数替代eval
          const objStr = match[1].trim()
          // 创建一个临时函数来安全地解析对象
          const func = new Function(`return (${objStr})`)
          const extracted = func()
          out = { ...out, ...extracted }
        } catch (e) {
          console.warn(`Could not parse dictionary file: ${fp}`, e)
        }
      }
    } catch (error) {
      console.warn(`Could not read dictionary file: ${fp}`, error)
    }
  }
  return out
}

// 提取键的辅助函数
function extractKeys(line: string, type: 'ts'|'html'): { oldKey: string | null, newKey: string | null } {
  const s = String(line || '')
  if (type === 'ts') {
    // Detect new key from get('key')
    const n = s.match(/this\.[A-Za-z_]\w*\.get\(\s*['"]([A-Za-z0-9_.]+)['"]/)
    // Detect old key from getLocale/getLocal(...).path
    const oLocal = s.match(/this\.[A-Za-z_]\w*\.(?:getLocale|getLocal)\([^)]*\)\.([A-Za-z0-9_.]+)/)
    // Detect old key from property chain followed by replace(...) calls
    const oReplace = s.match(/this\.[A-Za-z_]\w*\.([A-Za-z0-9_.]+)(?=\.replace\()/)
    // Detect old key from indexed literal access: this.alias.base['lit'] -> base.lit
    const oIndexLit = s.match(/this\.[A-Za-z_]\w*\.([A-Za-z0-9_.]+)\s*\[\s*['"]([^'"]+)['"]\s*\]/)
    // Fallback: plain property chain without trailing call
    const oPlain = s.match(/this\.[A-Za-z_]\w*\.([A-Za-z0-9_.]+)(?!\s*\()/)
    const oldKey = oIndexLit ? `${oIndexLit[1]}.${oIndexLit[2]}` : (oLocal && oLocal[1]) || (oReplace && oReplace[1]) || (oPlain && oPlain[1]) || null
    return { oldKey, newKey: n && n[1] || null }
  } else {
    const n = s.match(/\{\{\s*['"]([A-Za-z0-9_.]+)['"]\s*\|\s*i18n/)
    // Plain interpolation: {{ alias.path }}
    const oPlain = s.match(/\{\{\s*[A-Za-z_]\w*\.([A-Za-z0-9_.]+)\s*\}\}/)
    // Indexed literal: {{ alias.base['lit'] }}
    const oIndexLit = s.match(/\{\{\s*[A-Za-z_]\w*\.([A-Za-z0-9_.]+)\s*\[\s*['"]([^'"]+)['"]\s*\}\}/)
    // Replace chain: {{ alias.path.replace(...).replace(...)}}
    const oReplace = s.match(/\{\{\s*[A-Za-z_]\w*\.([A-Za-z0-9_.]+)\s*(?:\.replace\([^)]*\))+\s*\}\}/)
    const oldKey = oIndexLit ? `${oIndexLit[1]}.${oIndexLit[2]}` : (oReplace && oReplace[1]) || (oPlain && oPlain[1]) || null
    return { oldKey, newKey: n && n[1] || null }
  }
}

// 从字典中获取值的辅助函数
function valueOf(map: Record<string, any>, key: string | null): string | null {
  if (!key) return null
  const v = map[key]
  if (v === undefined) return null
  return Array.isArray(v) ? JSON.stringify(v) : String(v)
}

// 从字典中选择候选键的辅助函数
function pickKeyCandidate(union: string[], raw: string): string | null {
  const r = String(raw || '').replace(/\.$/, '')
  if (!r) return null
  const parts = r.split('.')
  const last = parts[parts.length - 1]
  const base = parts.length > 1 ? parts[0] : ''
  const cands: string[] = []
  for (const k of union) {
    if (k.endsWith(`.${last}`) || k === last || (base && k.startsWith(`${base}.`) && k.includes(`.${last}`))) cands.push(k)
  }
  cands.sort((a, b) => a.length - b.length)
  return cands[0] || null
}

// 提取类名和服务名
function extractClassAndServiceNames(sf: ts.SourceFile): { className: string; serviceName: string } {
  let className = ''
  let serviceName = ''
  const visit = (node: ts.Node) => {
    if (ts.isClassDeclaration(node) && node.name) {
      className = node.name.text
      for (const m of node.members) {
        if (ts.isConstructorDeclaration(m)) {
          for (const p of m.parameters) {
            if (p.type && ts.isTypeReferenceNode(p.type) && ts.isIdentifier(p.type.typeName) && p.type.typeName.text === config.serviceTypeName) {
              if (ts.isIdentifier(p.name)) serviceName = p.name.text
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return { className, serviceName }
}

// 扫描外部别名
function scanExternalAliases(tsFiles: string[]): Map<string, VarAlias[]> {
  const externalAliases = new Map<string, VarAlias[]>()
  info('scanning aliases', { count: tsFiles.length })
  
  for (const f of tsFiles) {
    try {
      const src = readFile(f)
      const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
      
      if (!sf) {
        warn('Could not parse source file', { file: f });
        continue;
      }
      
      const { className, serviceName } = extractClassAndServiceNames(sf)
      
      if (className && serviceName) {
        const aliases = collectVarAliases(sf, serviceName, config.getLocalMethod)
        if (aliases.length) {
          externalAliases.set(className, aliases)
        }
      }
    } catch (error) {
      if (error instanceof Error && (error.constructor.name === 'ParseError' || error.constructor.name === 'AstProcessingError')) {
        warn('Error processing file during alias scan', { file: f, error });
      } else {
        warn('Unexpected error processing file during alias scan', { file: f, error: error instanceof Error ? error : new Error(String(error)) });
      }
    }
  }
  
  return externalAliases
}

// 处理 TS 和 HTML 文件的主要函数
export function processTsFilesAndHandle(mode: 'replace' | 'delete') {
  const dir = config.dir || process.cwd()
  const tsFiles = walk(dir, p => p.endsWith('.ts')) // 收集 TS 文件
  const externalAliases = mode !== 'delete' ? scanExternalAliases(tsFiles) : new Map<string, VarAlias[]>()
  
  const results: Array<{ file: string; type: 'ts'|'html'; changed: boolean; deleted?: string[] }> = [] // 结果列表
  const complexCases: ComplexCase[] = [] // 复杂情况列表
  // 简化处理，不实现完整的字典加载
  const unionKeys: string[] = []
  
  const details: Array<{ file: string; type: 'ts'|'html'; changes: Array<{ line: number; before: string; after: string; beforeKey: string | null; afterKey: string | null; zhBefore: string | null; enBefore: string | null; zhAfter: string | null; enAfter: string | null }>; deleted?: string[] }> = []
  
  // 处理每个 TS 文件
  for (const f of tsFiles) {
    if (mode === 'delete') {
      processDeleteModeFile(f, results, details, unionKeys)
    } else {
      processReplaceModeFile(f, externalAliases, results, details, complexCases, unionKeys)
    }
  }
  
  // 生成报告
  generateReport(dir, results, details, complexCases)
}

// 处理 delete 模式的文件
function processDeleteModeFile(
  file: string,
  results: Array<{ file: string; type: 'ts'|'html'; changed: boolean; deleted?: string[] }>,
  details: Array<{ file: string; type: 'ts'|'html'; changes: Array<{ line: number; before: string; after: string; beforeKey: string | null; afterKey: string | null; zhBefore: string | null; enBefore: string | null; zhAfter: string | null; enAfter: string | null }>; deleted?: string[] }>,
  unionKeys: string[]
) {
  try {
    const before = readFile(file)
    const sourceFile = ts.createSourceFile(file, before, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    
    if (!sourceFile) {
      warn('Could not parse source file', { file });
      return;
    }
    
    const { code: after, deleted } = pruneUnused(sourceFile, before, [])
    const changedTs = after !== before
    if (changedTs) writeFile(file, after)
    
    results.push({ file, type: 'ts', changed: changedTs, deleted: deleted?.length ? deleted : undefined })
    
    // 只有在发生变化时才计算差异，提高性能
    if (changedTs) {
      const tsDiff = diffLines(before, after)
      const tsChanges = tsDiff.map(d => {
        const ks = extractKeys(d.before, 'ts')
        const ks2 = extractKeys(d.after, 'ts')
        const bk = ks.oldKey ? pickKeyCandidate(unionKeys, ks.oldKey) : null
        const ak = ks2.newKey || (ks2.oldKey ? pickKeyCandidate(unionKeys, ks2.oldKey) : null)
        return {
          line: d.line,
          before: d.before,
          after: d.after,
          beforeKey: bk,
          afterKey: ak,
          zhBefore: null,
          enBefore: null,
          zhAfter: null,
          enAfter: null
        }
      })
      
      if (tsChanges.length || (deleted && deleted.length)) {
        details.push({ file, type: 'ts', changes: tsChanges, deleted })
      }
    }
  } catch (error) {
    warn('Error processing file in delete mode', { file, error: error instanceof Error ? error : new Error(String(error)) });
  }
}

// 处理 replace 模式的文件
function processReplaceModeFile(
  file: string,
  externalAliases: Map<string, VarAlias[]>,
  results: Array<{ file: string; type: 'ts'|'html'; changed: boolean; deleted?: string[] }>,
  details: Array<{ file: string; type: 'ts'|'html'; changes: Array<{ line: number; before: string; after: string; beforeKey: string | null; afterKey: string | null; zhBefore: string | null; enBefore: string | null; zhAfter: string | null; enAfter: string | null }>; deleted?: string[] }>,
  complexCases: ComplexCase[],
  unionKeys: string[]
) {
  const rawRes = processFile(file, externalAliases) // 处理 TS 文件
  
  if (rawRes.changed) writeFile(file, rawRes.tsAfter)
  if (rawRes.htmlPath && rawRes.htmlAfter !== rawRes.htmlBefore) {
    writeFile(rawRes.htmlPath, rawRes.htmlAfter)
  }

  // 收集复杂情况
  complexCases.push(...rawRes.complexCases)
  
  let deleted: string[] | undefined
  if (dryRun) {
     const dummySf = ts.createSourceFile(file, rawRes.tsAfter, ts.ScriptTarget.Latest, true)
     const res = pruneUnused(dummySf, rawRes.tsAfter, rawRes.aliases)
     deleted = res.deleted
  }

  results.push({ 
    file, 
    type: 'ts', 
    changed: rawRes.changed, 
    deleted: deleted?.length ? deleted : undefined 
  }) // 记录结果
  
  // 处理 TS 文件变更
  const tsDiff = diffLines(rawRes.tsBefore || '', rawRes.tsAfter || '')
  const tsChanges = tsDiff.map(d => {
    const ks = extractKeys(d.before, 'ts')
    const ks2 = extractKeys(d.after, 'ts')
    const bk = ks.oldKey ? pickKeyCandidate(unionKeys, ks.oldKey) : null
    const ak = ks2.newKey || (ks2.oldKey ? pickKeyCandidate(unionKeys, ks2.oldKey) : null)
    return {
      line: d.line,
      before: d.before,
      after: d.after,
      beforeKey: bk,
      afterKey: ak,
      zhBefore: null,
      enBefore: null,
      zhAfter: null,
      enAfter: null
    }
  })
  
  if (tsChanges.length || (deleted && deleted.length)) {
    details.push({ file, type: 'ts', changes: tsChanges, deleted })
  }
  
  // 处理 HTML 文件变更
  if (rawRes.htmlPath && fs.existsSync(rawRes.htmlPath)) {
    const htmlDiff = diffLines(rawRes.htmlBefore || '', rawRes.htmlAfter || '')
    const htmlChanges = htmlDiff.map(d => {
      const ks = extractKeys(d.before, 'html')
      const ks2 = extractKeys(d.after, 'html')
      const bk = ks.oldKey ? pickKeyCandidate(unionKeys, ks.oldKey) : null
      const ak = ks2.newKey || (ks2.oldKey ? pickKeyCandidate(unionKeys, ks2.oldKey) : null)
      return {
        line: d.line,
        before: d.before,
        after: d.after,
        beforeKey: bk,
        afterKey: ak,
        zhBefore: null,
        enBefore: null,
        zhAfter: null,
        enAfter: null
      }
    })
    
    if (htmlChanges.length) {
      details.push({ file: rawRes.htmlPath, type: 'html', changes: htmlChanges })
    }
  }
}

// 生成报告
function generateReport(
  dir: string,
  results: Array<{ file: string; type: 'ts'|'html'; changed: boolean; deleted?: string[] }>,
  details: Array<{ file: string; type: 'ts'|'html'; changes: Array<{ line: number; before: string; after: string; beforeKey: string | null; afterKey: string | null; zhBefore: string | null; enBefore: string | null; zhAfter: string | null; enAfter: string | null }>; deleted?: string[] }>,
  complexCases: ComplexCase[]
) {
  const changed = results.filter(r => r.changed).length // 统计变更数
  const summary = { dir, files: results.length, changed, missingKeys: 0 } // 汇总信息
  
  // 生成 HTML 报告
  const outDir = path.isAbsolute((config.jsonOutDir || 'i18n-refactor/out')) ? 
    (config.jsonOutDir as string) : 
    path.join(process.cwd(), (config.jsonOutDir || 'i18n-refactor/out'))
  
  fs.mkdirSync(outDir, { recursive: true })
  const html = renderHtmlReport(summary, results.filter(r => r.changed), details, complexCases)
  const fp = path.join(outDir, 'report.html')
  fs.writeFileSync(fp, html, 'utf8')
  info('html report written', { file: fp })
}

// HTML 报告渲染函数
export function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// 渲染 HTML 头部
function renderHtmlHead(): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>I18n Refactor Report</title><style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:24px;background:#fafafa;color:#222}
.summary{display:flex;gap:16px;margin-bottom:20px}
.card{background:#fff;border:1px solid #eee;border-radius:8px;padding:12px 16px;box-shadow:0 1px 2px rgba(0,0,0,0.04)}
.card h3{margin:0 0 6px;font-size:14px;color:#555}
.card .num{font-size:20px;font-weight:600}
.files{margin:16px 0}
.file{margin:16px 0;padding:12px;border:1px solid #eee;background:#fff;border-radius:8px}
.file h4{margin:0 0 10px;font-size:14px;color:#333}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #eee;padding:8px;text-align:left;vertical-align:top;font-size:13px}
th{background:#f6f6f6}
.changed{color:#0a7; font-weight:600}
.unchanged{color:#999}
.mono{font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace}
.key{background:#f0f7ff;border-radius:4px;padding:2px 6px}
.section-title{margin-top:28px;margin-bottom:8px;font-size:15px}
</style></head><body>`
}

// 渲染摘要部分
function renderSummary(summary: { dir: string; files: number; changed: number; missingKeys: number }): string {
  return `<div class="summary">
    <div class="card"><h3>Directory</h3><div class="num mono">${escapeHtml(summary.dir)}</div></div>
    <div class="card"><h3>Total Files</h3><div class="num">${summary.files}</div></div>
    <div class="card"><h3>Changed Files</h3><div class="num">${summary.changed}</div></div>
    <div class="card"><h3>Missing Keys</h3><div class="num">${summary.missingKeys}</div></div>
  </div>`
}

// 渲染文件列表部分
function renderFileList(results: Array<{ file: string; type: 'ts'|'html'; changed: boolean; deleted?: string[] }>): string {
  return `<div class="files"><div class="section-title">Files</div><table><thead><tr><th>File</th><th>Type</th><th>Status</th></tr></thead><tbody>${
    results.map(r => `<tr><td class="mono">${escapeHtml(r.file)}</td><td>${r.type}</td><td>${r.changed ? '<span class="changed">changed</span>' : '<span class="unchanged">unchanged</span>'}${r.deleted?.length ? ' <span style="color:#c00;font-size:12px;font-weight:600">(has deletions)</span>' : ''}</td></tr>`).join('')
  }</tbody></table></div>`
}

// 渲染文件变更详情
function renderFileDetails(details: Array<{ file: string; type: 'ts'|'html'; changes: Array<{ line: number; before: string; after: string; beforeKey: string | null; afterKey: string | null; zhBefore: string | null; enBefore: string | null; zhAfter: string | null; enAfter: string | null }>; deleted?: string[] }>): string {
  return details.map(d => {
    const deletedHtml = d.deleted && d.deleted.length ? 
      `<div style="margin-bottom:10px;padding:8px;background:#fff5f5;border:1px solid #ffcccc;border-radius:4px">
         <h5 style="margin:0 0 4px;color:#c00;font-size:13px">Deleted Items:</h5>
         <ul style="margin:0;padding-left:20px;color:#a00;font-size:13px">${d.deleted.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
       </div>` : ''
    
    const rows = d.changes.map(c => `<tr>
      <td>${c.line}</td>
      <td class="mono">${escapeHtml(c.before)}</td>
      <td class="mono">${escapeHtml(c.after)}</td>
      <td>${c.beforeKey ? `<span class="key mono">${escapeHtml(c.beforeKey)}</span>` : ''}<div class="mono" style="color:#666">${escapeHtml(c.zhBefore || '')}</div><div class="mono" style="color:#666">${escapeHtml(c.enBefore || '')}</div></td>
      <td>${c.afterKey ? `<span class="key mono">${escapeHtml(c.afterKey)}</span>` : ''}<div class="mono" style="color:#666">${escapeHtml(c.zhAfter || '')}</div><div class="mono" style="color:#666">${escapeHtml(c.enAfter || '')}</div></td>
    </tr>`).join('')
    
    return `<div class="file"><h4>${escapeHtml(d.file)} <span style="color:#999">(${d.type})</span></h4>
      ${deletedHtml}
      <table>
        <thead><tr><th>Line</th><th>Before</th><th>After</th><th>Original Key & Value</th><th>Replaced Key & Value</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
  }).join('')
}

// 渲染复杂情况部分
function renderComplexCases(complexCases: ComplexCase[]): string {
  if (complexCases.length === 0) return ''
  
  return `
    <div class="section-title" style="margin-top:32px">Complex Cases (${complexCases.length})</div>
    <div style="margin:16px 0">
      <table>
        <thead>
          <tr>
            <th>File</th>
            <th>Line</th>
            <th>Type</th>
            <th>Severity</th>
            <th>Code</th>
            <th>Reason</th>
            <th>Suggestion</th>
          </tr>
        </thead>
        <tbody>
          ${complexCases.map(c => {
            const severityColor = c.severity === 'error' ? '#d00' : c.severity === 'warning' ? '#f90' : '#999'
            const typeLabel = c.type.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
            return `<tr>
              <td class="mono" style="font-size:12px">${escapeHtml(c.file)}</td>
              <td>${c.line}</td>
              <td><span style="background:#f0f0f0;padding:2px 6px;border-radius:3px;font-size:12px">${escapeHtml(typeLabel)}</span></td>
              <td><span style="color:${severityColor};font-weight:600">${escapeHtml(c.severity)}</span></td>
              <td class="mono" style="background:#f9f9f9;font-size:12px">${escapeHtml(c.code)}</td>
              <td style="font-size:12px">${escapeHtml(c.reason)}</td>
              <td style="font-size:12px;color:#666">${escapeHtml(c.suggestion)}</td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
    </div>
  `
}

// 主渲染函数
function renderHtmlReport(
  summary: { dir: string; files: number; changed: number; missingKeys: number },
  results: Array<{ file: string; type: 'ts'|'html'; changed: boolean; deleted?: string[] }>,
  details: Array<{ file: string; type: 'ts'|'html'; changes: Array<{ line: number; before: string; after: string; beforeKey: string | null; afterKey: string | null; zhBefore: string | null; enBefore: string | null; zhAfter: string | null; enAfter: string | null }>; deleted?: string[] }>,
  complexCases: ComplexCase[]
): string {
  const head = renderHtmlHead()
  const sum = renderSummary(summary)
  const list = renderFileList(results)
  const detailHtml = renderFileDetails(details)
  const complexCasesHtml = renderComplexCases(complexCases)
  const tail = `</body></html>`
  
  return head + sum + list + `<div class="section-title">Changes</div>` + detailHtml + complexCasesHtml + tail
}