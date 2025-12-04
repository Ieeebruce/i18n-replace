#!/usr/bin/env node
import * as fs from 'fs' // 文件系统，用于读写
import * as path from 'path' // 路径工具，用于定位
import ts from 'typescript' // TypeScript AST 解析
import { extractReplaceParams } from '../core/params-extractor' // 提取 replace 参数对象
import { pruneUnused } from '../replace/prune' // 清理无用别名声明/赋值
import { collectVarAliases } from '../core/var-alias' // AST 收集别名信息
import { renderTsGet } from '../replace/ts-replace' // 渲染 TS 调用 this.<alias>.get
import { pickRoot, setDictDir } from '../util/dict-reader' // 选择字典根与设置字典目录

function readFile(p: string): string { return fs.readFileSync(p, 'utf8') } // 读取文本文件
function writeFile(p: string, s: string) { fs.writeFileSync(p, s, 'utf8') } // 写出文本文件
function walk(dir: string, filter: (p: string) => boolean): string[] { // 递归遍历目录并按过滤器收集文件
  const out: string[] = [] // 输出文件列表
  const entries = fs.readdirSync(dir, { withFileTypes: true }) // 读取目录条目
  for (const e of entries) { // 遍历条目
    const full = path.join(dir, e.name) // 计算完整路径
    if (e.isDirectory()) out.push(...walk(full, filter)) // 目录则递归
    else if (filter(full)) out.push(full) // 文件且匹配过滤器则加入
  }
  return out // 返回
}

function replaceHtmlContent(src: string, aliasInfos: Array<{ name: string; roots?: string[]; prefix?: string | null }>): string {
  let s = src
  const info = new Map<string, { roots?: string[]; prefix?: string | null }>()
  for (const a of aliasInfos) info.set(a.name, { roots: a.roots, prefix: a.prefix })
  // 链式模板替换：{{ var.key.replace('{a}', x).replace('{b}', y) }} → {{ 'key' | i18n: {a:x,b:y} }}
  s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)((?:\.replace\([^)]*\))+)[^}]*\}\}/g, (_m, v, key, chain) => {
    const vn = String(v)
    const ai = info.get(vn)
    if (!ai) return _m
    const rp = ai.roots && ai.roots.length ? pickRoot(ai.roots, String(key)) : ''
    const rootPrefix = rp ? rp + '.' : ''
    const params = extractReplaceParams(chain)
    const p = Object.keys(params).length ? `: ${JSON.stringify(params)}` : ''
    return `{{ '${rootPrefix}${key}' | i18n${p} }}`
  })
  // 索引字面量：{{ var.key['x'] }} 或 {{ var.key["x"] }}
  s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)\s*\[(['"])([^'\"]+)\3\]\s*\}\}/g, (_m, v, base, _q, lit) => {
    const vn = String(v)
    const ai = info.get(vn)
    if (!ai) return _m
    const rp = ai.roots && ai.roots.length ? pickRoot(ai.roots, String(base)) : ''
    const rootPrefix = rp ? rp + '.' : ''
    return `{{ '${rootPrefix}${base}.${lit}' | i18n }}`
  })
  // 索引动态表达式：{{ var.key[idx] }} → {{ ('key.' + idx) | i18n }}
  s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)\s*\[([^\]]+)\]\s*\}\}/g, (_m, v, base, expr) => {
    const vn = String(v)
    const ai = info.get(vn)
    if (!ai) return _m
    const rp = ai.roots && ai.roots.length ? pickRoot(ai.roots, String(base)) : ''
    const rootPrefix = rp ? rp + '.' : ''
    return `{{ ('${rootPrefix}${base}.' + ${expr.trim()}) | i18n }}`
  })
  // 简单属性：{{ var.key }} → {{ 'key' | i18n }}
  s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)\s*\}\}/g, (_m, v, key) => {
    const vn = String(v)
    const ai = info.get(vn)
    if (!ai) return _m
    const rp = ai.roots && ai.roots.length ? pickRoot(ai.roots, String(key)) : ''
    const rootPrefix = rp ? rp + '.' : ''
    return `{{ '${rootPrefix}${key}' | i18n }}`
  })
  return s
}

function toReplaceChain(params: Record<string, string>): string { // 将对象 {k:expr} 转回 .replace 链
  let chain = ''
  for (const k of Object.keys(params)) {
    chain += `.replace('{${k}}', ${params[k]})`
  }
  return chain
}

function restoreHtmlContent(src: string, alias: string | null): string { // 将管道表达式还原为变量访问与 .replace 链
  const varName = alias || 'i18n'
  let s = src
  // 还原：{{ 'a.b.c' | i18n: {k:expr} }} → {{ varName.a.b.c.replace('{k}', expr) }}
  s = s.replace(/\{\{\s*'([A-Za-z0-9_.]+)'\s*\|\s*i18n\s*:\s*(\{[^}]*\})\s*\}\}/g, (_m, key, obj) => {
    try {
      // 将对象字面量安全解析为键值对（保留 expr 文本，简单替换引号包装保持原值）
      const sanitized = obj.replace(/(['"])\s*([^:'"])\s*\1\s*:/g, (_mm: string, _q: string, k: string) => `'${k}':`) // 规范化键
      const parsed = Function(`return (${sanitized})`)() as Record<string, string>
      const chain = toReplaceChain(parsed)
      return `{{ ${varName}.${key}${chain} }}`
    } catch {
      return `{{ ${varName}.${key} }}`
    }
  })
  // 还原：{{ ('a.b.' + idx) | i18n }} → {{ varName.a.b[idx] }}
  s = s.replace(/\{\{\s*\('([A-Za-z0-9_.]+)\.'\s*\+\s*([^\)]+)\)\s*\|\s*i18n\s*\}\}/g, (_m, base, expr) => {
    return `{{ ${varName}.${base}[${expr.trim()}] }}`
  })
  // 还原：{{ 'a.b.c' | i18n }} → {{ varName.a.b.c }}
  s = s.replace(/\{\{\s*'([A-Za-z0-9_.]+)'\s*\|\s*i18n\s*\}\}/g, (_m, key) => {
    return `{{ ${varName}.${key} }}`
  })
  return s
}

function collectGetLocalVars(tsCode: string): string[] {
  const names = new Set<string>()
  const re = /this\.([A-Za-z_]\w*)\s*=\s*[^;]*\.getLocale\([^)]*\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(tsCode))) names.add(m[1])
  return Array.from(names)
}

function buildAliases(tsCode: string): Array<{ name: string; prefix: string | null; roots?: string[] }> {
  const sf = ts.createSourceFile('x.ts', tsCode, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const aliases = collectVarAliases(sf, 'locale', 'getLocale')
  const out: Array<{ name: string; prefix: string | null; roots?: string[] }> = []
  for (const a of aliases) out.push({ name: a.name, prefix: a.prefix, roots: a.roots })
  const rx = /\b([A-Za-z_]\w*)\s*=\s*this\.locale\.getLocale\s*\(/g
  let m: RegExpExecArray | null
  while ((m = rx.exec(tsCode))) out.push({ name: m[1], prefix: null })
  if (/this\.i18n\./.test(tsCode) && !out.find(x => x.name === 'i18n')) out.push({ name: 'i18n', prefix: null })
  if (/this\.dict\./.test(tsCode) && !out.find(x => x.name === 'dict')) out.push({ name: 'dict', prefix: null })
  // 不再将所有 this.<name>. 视为别名，避免误替换普通对象/数组方法
  return Array.from(new Set(out.map(o => JSON.stringify(o)))).map(s => JSON.parse(s))
}

function replaceTsContent(src: string): string {
  let s = src
  const aliases = buildAliases(src)
  for (const a of aliases) {
    const name = a.name
    const composeKey = (path: string) => {
      if (a.prefix) return `${a.prefix}.${path}`
      if (a.roots && a.roots.length) {
        const r = pickRoot(a.roots, path)
        return r ? `${r}.${path}` : path
      }
      return path
    }
    // chain .replace()
  s = s.replace(new RegExp(`this\.${name}\.([A-Za-z0-9_.]+)((?:\\.replace\\([^)]*\\))+)`, 'g'), (_m, path, chain) => {
    const params = extractReplaceParams(chain)
    return renderTsGet(name, { keyExpr: composeKey(String(path)), params })
  })
    // element access with string literal '...'
  s = s.replace(new RegExp(`this\.${name}\.([A-Za-z0-9_.]+)\\s*\\[\\s*'([^']+)'\\s*\\]`, 'g'), (_m, base, lit) => {
    return renderTsGet(name, { keyExpr: composeKey(`${String(base)}.${String(lit)}`) })
  })
    // element access with string literal "..."
  s = s.replace(new RegExp(`this\.${name}\.([A-Za-z0-9_.]+)\\s*\\[\\s*\"([^\"]+)\"\\s*\\]`, 'g'), (_m, base, lit) => {
    return renderTsGet(name, { keyExpr: composeKey(`${String(base)}.${String(lit)}`) })
  })
    // dynamic element access [expr]
  s = s.replace(new RegExp(`this\.${name}\.([A-Za-z0-9_.]+)\\s*\\[([^\\]]+)\\]`, 'g'), (_m, base, expr) => {
    const basePath = composeKey(String(base))
    return renderTsGet(name, { keyExpr: `'${basePath}.' + ${String(expr).trim()}` })
  })
    // plain property chain (not followed by call/replace/[ or assignment)
  s = s.replace(new RegExp(`(^|[\\s,(])this\.${name}\.([A-Za-z0-9_.]+)(?!\\s*\\(|\\s*\\.replace|\\s*\\[|\\s*=)`, 'g'), (_m, pre, path) => {
    return `${pre}${renderTsGet(name, { keyExpr: composeKey(String(path)) })}`
  })
  }
  return s
}

function processTsFile(tsPath: string): { changed: boolean; code: string; aliases: string[]; htmlPath: string | null } {
  const before = readFile(tsPath)
  const varNames = collectGetLocalVars(before)
  let after = replaceTsContent(before)
  after = pruneUnused({} as any, after, varNames)
  // unify alias get-calls to this.i18n.get
  const aliasInfos = buildAliases(before)
  for (const a of aliasInfos) {
    if (a.name !== 'i18n') {
      after = after.replace(new RegExp(`this\\.${a.name}\\\.get(?!Locale)\\s*\\(`, 'g'), 'this.i18n.get(')
      after = after.replace(new RegExp(`\\b${a.name}\\s*:\\s*any\\s*;`, 'g'), '')
    }
  }
  // normalize constructor to inject I18nService
  after = after.replace(/constructor\s*\(([^)]*)\)/, (m, params) => {
    let p = params
    p = p.replace(/\b(private|public)?\s*locale\s*:\s*I18nLocaleService\b/, 'public i18n: I18nService')
    if (!/I18nService\b/.test(p)) {
      p = (p.trim().length ? p + ', ' : '') + 'public i18n: I18nService'
    }
    return `constructor(${p})`
  })
  // remove remaining getLocale/getLocal assignments
  after = after.replace(/this\.[A-Za-z_]\w*\s*=\s*[^;]*\.(?:getLocal|getLocale)\([^)]*\)(?:\.[A-Za-z0-9_.]+)?\s*;?/g, '')
  const sf = ts.createSourceFile(tsPath, after, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const aliases = collectVarAliases(sf, 'locale', 'getLocale').map(a => a.name)
  // also include direct assignments from locale.getLocale()
  const rx = /\b([A-Za-z_]\w*)\s*=\s*this\.locale\.getLocale\s*\(/g
  let mm: RegExpExecArray | null
  while ((mm = rx.exec(after))) aliases.push(mm[1])
  if (/\bi18n\s*:\s*/.test(after) || /this\.i18n\s*=/.test(after)) aliases.push('i18n')
  if (/\bdict\s*:\s*/.test(after) || /this\.dict\s*=/.test(after)) aliases.push('dict')
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
  if (after !== before) writeFile(tsPath, after)
  return { changed: after !== before, code: after, aliases: Array.from(new Set(aliases)), htmlPath }
}

function collectHtmlAliases(tsPath: string): string[] {
  try {
    const code = readFile(tsPath)
    const sf = ts.createSourceFile('c.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const aliases = collectVarAliases(sf, 'locale', 'getLocale')
    const names = new Set<string>()
    for (const a of aliases) names.add(a.name)
    const rx = /\b([A-Za-z_]\w*)\s*=\s*this\.locale\.getLocale\s*\(/g
    let m: RegExpExecArray | null
    while ((m = rx.exec(code))) names.add(m[1])
    if (/\bi18n\s*:\s*/.test(code) || /this\.i18n\s*=/.test(code)) names.add('i18n')
    if (/\bdict\s*:\s*/.test(code) || /this\.dict\s*=/.test(code)) names.add('dict')
    return Array.from(names)
  } catch { return [] }
}

function processHtmlWithAliases(htmlPath: string, mode: 'replace' | 'restore', aliasInfos: Array<{ name: string; roots?: string[]; prefix?: string | null }>): { changed: boolean } {
  const before = readFile(htmlPath)
  const aliasNames = aliasInfos.map(a => a.name)
  const alias = aliasNames.includes('i18n') ? 'i18n' : (aliasNames[0] || null)
  const after = mode === 'restore' ? restoreHtmlContent(before, alias) : replaceHtmlContent(before, aliasInfos)
  if (after !== before) writeFile(htmlPath, after)
  return { changed: after !== before }
}

function main() { // CLI 主入口
  const args = process.argv.slice(2) // 读取参数
  let dir = process.cwd() // 默认目录为当前工作目录
  let mode: 'replace' | 'restore' = 'replace' // 默认模式为替换
  for (const a of args) { // 解析参数
    const m = a.match(/^--dir=(.+)$/) // 指定目录
    if (m) dir = path.isAbsolute(m[1]) ? m[1] : path.join(process.cwd(), m[1]) // 解析绝对/相对路径
    const r = a.match(/^--mode=(replace|restore)$/) // 指定模式
    if (r) mode = r[1] as any // 设置模式
    const d = a.match(/^--dictDir=(.+)$/) // 指定字典目录
    if (d) setDictDir(d[1]) // 设置目录
  }
  const tsFiles = walk(dir, p => p.endsWith('.ts')) // 收集 TS 文件
  const results: Array<{ file: string; type: 'ts'|'html'; changed: boolean }> = [] // 结果列表
  for (const f of tsFiles) { // 遍历 TS
    const r = processTsFile(f) // 处理 TS 文件
    results.push({ file: f, type: 'ts', changed: r.changed }) // 记录结果
    if (r.htmlPath && fs.existsSync(r.htmlPath)) { // 若关联模板存在
      const aliasInfos = buildAliases(r.code) // 基于替换后 TS 构建别名信息
      const hr = processHtmlWithAliases(r.htmlPath, mode, aliasInfos) // 处理模板
      results.push({ file: r.htmlPath, type: 'html', changed: hr.changed }) // 记录结果
    }
  }
  const changed = results.filter(r => r.changed).length // 统计变更数
  const summary = { dir, files: results.length, changed } // 汇总信息
  process.stdout.write(JSON.stringify({ summary, results }, null, 2) + '\n') // 输出 JSON 摘要
}

main() // 执行主程序
