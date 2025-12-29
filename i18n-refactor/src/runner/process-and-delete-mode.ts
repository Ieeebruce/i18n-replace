import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';
import { config } from '../core/config';
import { info, warn } from '../util/logger';
import { setDictDir } from '../util/dict-reader';
import { processComponent, ComplexCase } from './component';
import { pruneUnused } from '../replace/prune';
import { collectVarAliases, VarAlias } from '../core/var-alias';

// 读取和写入文件的辅助函数
function readFile(p: string): string { return fs.readFileSync(p, 'utf8') } // 读取文本文件
let dryRun = !!config.dryRun // 干运行，从配置读取
function writeFile(p: string, s: string) { if (!dryRun) fs.writeFileSync(p, s, 'utf8') } // 写出文本文件（支持 dry-run）

// 递归遍历目录并按过滤器收集文件
function walk(dir: string, filter: (p: string) => boolean): string[] {
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
    console.warn(`Warning: Could not read directory ${dir}`, error);
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
    // 注意：这里需要导入flattenLangFile，暂时简化处理
    out = { ...out, ...{} }
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

// 处理 TS 和 HTML 文件的主要函数
export function processTsFilesAndHandle(mode: 'replace' | 'delete') {
  const dir = config.dir || process.cwd()
  const tsFiles = walk(dir, p => p.endsWith('.ts')) // 收集 TS 文件
  const externalAliases = new Map<string, VarAlias[]>()
  
  if (mode !== 'delete') {
    info('scanning aliases', { count: tsFiles.length })
    for (const f of tsFiles) {
      const src = readFile(f)
      const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
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
      if (className && serviceName) {
        const aliases = collectVarAliases(sf, serviceName, config.getLocalMethod)
        if (aliases.length) {
          console.log(`[DEBUG] Found aliases in ${className}:`, aliases)
          externalAliases.set(className, aliases)
        }
      }
    }
    console.log('[DEBUG] External aliases map keys:', Array.from(externalAliases.keys()))
    if (externalAliases.size > 0) {
        for (const [k, v] of externalAliases) {
            console.log(`[DEBUG] External Alias ${k}:`, v.map(a => `${a.name}->${a.prefix}`))
        }
    }
  }
  
  const results: Array<{ file: string; type: 'ts'|'html'; changed: boolean; deleted?: string[] }> = [] // 结果列表
  const complexCases: ComplexCase[] = [] // 复杂情况列表
  const langs = (config.languages || ['zh','en'])
  const dictDir = config.dictDir || 'src/app/i18n'
  const arrayMode = (config.jsonArrayMode || 'nested')
  // 简化处理，不实现完整的字典加载
  const unionKeys: string[] = []
  
  const details: Array<{ file: string; type: 'ts'|'html'; changes: Array<{ line: number; before: string; after: string; beforeKey: string | null; afterKey: string | null; zhBefore: string | null; enBefore: string | null; zhAfter: string | null; enAfter: string | null }>; deleted?: string[] }> = []
  
  for (const f of tsFiles) { // 遍历 TS
    if (mode === 'delete') {
      const before = readFile(f)
      const { code: after, deleted } = pruneUnused(ts.createSourceFile(f, before, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS), before, [])
      const changedTs = after !== before
      if (changedTs) writeFile(f, after)
      results.push({ file: f, type: 'ts', changed: changedTs, deleted: deleted?.length ? deleted : undefined })
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
      if (tsChanges.length || (deleted && deleted.length)) details.push({ file: f, type: 'ts', changes: tsChanges, deleted })
    } else {
      const r = processTsFile(f, externalAliases) // 处理 TS 文件
      
      // 收集复杂情况
      complexCases.push(...r.complexCases)
      
      let deleted: string[] | undefined
      if (dryRun) {
         const dummySf = ts.createSourceFile(f, r.code, ts.ScriptTarget.Latest, true)
         const res = pruneUnused(dummySf, r.code, r.aliases)
         deleted = res.deleted
      }

      results.push({ file: f, type: 'ts', changed: r.changed, deleted: deleted?.length ? deleted : undefined }) // 记录结果
      const last = (processTsFile as any)._last || {}
      const tsDiff = diffLines(last.tsBefore || '', last.tsAfter || '')
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
      if (tsChanges.length || (deleted && deleted.length)) details.push({ file: f, type: 'ts', changes: tsChanges, deleted })
      if (r.htmlPath && fs.existsSync(r.htmlPath)) { // 若关联模板存在
        const htmlDiff = diffLines(last.htmlBefore || '', last.htmlAfter || '')
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
        if (htmlChanges.length) details.push({ file: r.htmlPath, type: 'html', changes: htmlChanges })
      }
    }
  }
  
  const changed = results.filter(r => r.changed).length // 统计变更数
  const summary = { dir, files: results.length, changed, missingKeys: 0 } // 汇总信息
  
  // 生成 HTML 报告
  const outDir = path.isAbsolute((config.jsonOutDir || 'i18n-refactor/out')) ? (config.jsonOutDir as string) : path.join(process.cwd(), (config.jsonOutDir || 'i18n-refactor/out'))
  fs.mkdirSync(outDir, { recursive: true })
  const html = renderHtmlReport(summary, results.filter(r => r.changed), details, complexCases)
  const fp = path.join(outDir, 'report.html')
  fs.writeFileSync(fp, html, 'utf8')
  info('html report written', { file: fp })
}

// 处理单个 TS 文件的函数
function processTsFile(tsPath: string, externalAliases?: Map<string, VarAlias[]>): { changed: boolean; code: string; aliases: string[]; htmlPath: string | null; complexCases: ComplexCase[] } {
  const before = readFile(tsPath)
  const sf = ts.createSourceFile(tsPath, before, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  // detect Angular Component and templateUrl
  let htmlPath: string | null = null
  const visit = (node: ts.Node) => {
    if (ts.isClassDeclaration(node)) {
      const decos = ts.canHaveDecorators(node) ? ts.getDecorators(node) : undefined
      for (const d of decos || []) {
        const expr = d.expression
        if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === 'Component') {
          const arg = expr.arguments[0]
          if (arg && ts.isObjectLiteralExpression(arg)) {
            for (const prop of arg.properties) {
              if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === 'templateUrl') {
                const v = prop.initializer
                if (v && ts.isStringLiteral(v)) {
                  const dir = path.dirname(tsPath)
                  htmlPath = path.resolve(dir, v.text)
                }
              }
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  const htmlBefore = htmlPath && fs.existsSync(htmlPath) ? readFile(htmlPath) : ''
  const { tsOut, htmlOut, aliases, complexCases: rawComplexCases } = processComponent(before, htmlBefore, tsPath, externalAliases)
  // 填充文件名
  const complexCases = rawComplexCases.map(c => ({ ...c, file: tsPath }))
  const changedTs = tsOut !== before
  const changedHtml = htmlPath ? (htmlOut !== htmlBefore) : false
  if (changedTs) writeFile(tsPath, tsOut)
  if (htmlPath && changedHtml) writeFile(htmlPath, htmlOut)
  ;(processTsFile as any)._last = { tsBefore: before, tsAfter: tsOut, htmlBefore, htmlAfter: htmlOut }
  return { changed: changedTs || changedHtml, code: tsOut, aliases, htmlPath, complexCases }
}

// HTML 报告渲染函数
function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderHtmlReport(
  summary: { dir: string; files: number; changed: number; missingKeys: number },
  results: Array<{ file: string; type: 'ts'|'html'; changed: boolean; deleted?: string[] }>,
  details: Array<{ file: string; type: 'ts'|'html'; changes: Array<{ line: number; before: string; after: string; beforeKey: string | null; afterKey: string | null; zhBefore: string | null; enBefore: string | null; zhAfter: string | null; enAfter: string | null }>; deleted?: string[] }>,
  complexCases: ComplexCase[]
): string {
  const head = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>I18n Refactor Report</title><style>
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
  const sum = `<div class="summary">
    <div class="card"><h3>Directory</h3><div class="num mono">${escapeHtml(summary.dir)}</div></div>
    <div class="card"><h3>Total Files</h3><div class="num">${summary.files}</div></div>
    <div class="card"><h3>Changed Files</h3><div class="num">${summary.changed}</div></div>
    <div class="card"><h3>Missing Keys</h3><div class="num">${summary.missingKeys}</div></div>
  </div>`
  const list = `<div class="files"><div class="section-title">Files</div><table><thead><tr><th>File</th><th>Type</th><th>Status</th></tr></thead><tbody>${
    results.map(r => `<tr><td class="mono">${escapeHtml(r.file)}</td><td>${r.type}</td><td>${r.changed ? '<span class="changed">changed</span>' : '<span class="unchanged">unchanged</span>'}${r.deleted?.length ? ' <span style="color:#c00;font-size:12px;font-weight:600">(has deletions)</span>' : ''}</td></tr>`).join('')
  }</tbody></table></div>`
  const detailHtml = details.map(d => {
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
  
  // 复杂情况部分
  const complexCasesHtml = complexCases.length > 0 ? `
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
  ` : ''
  
  const tail = `</body></html>`
  return head + sum + list + `<div class="section-title">Changes</div>` + detailHtml + complexCasesHtml + tail
}