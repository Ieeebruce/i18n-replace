#!/usr/bin/env node
import * as fs from 'fs'
import * as path from 'path'
import ts from 'typescript'
import { extractReplaceParams } from '../core/params-extractor'
import { pruneUnused } from '../replace/prune'
import { collectVarAliases } from '../core/var-alias'
import { renderTsGet } from '../replace/ts-replace'

function readFile(p: string): string { return fs.readFileSync(p, 'utf8') }
function writeFile(p: string, s: string) { fs.writeFileSync(p, s, 'utf8') }
function walk(dir: string, filter: (p: string) => boolean): string[] {
  const out: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(full, filter))
    else if (filter(full)) out.push(full)
  }
  return out
}

function replaceHtmlContent(src: string, varNames: string[]): string {
  let s = src
  // 链式模板替换：{{ var.key.replace('{a}', x).replace('{b}', y) }} → {{ 'key' | i18n: {a:x,b:y} }}
  s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)((?:\.replace\([^)]*\))+)[^}]*\}\}/g, (_m, v, key, chain) => {
    if (!varNames.includes(String(v))) return _m
    const params = extractReplaceParams(chain)
    const p = Object.keys(params).length ? `: ${JSON.stringify(params)}` : ''
    return `{{ '${key}' | i18n${p} }}`
  })
  // 索引字面量：{{ var.key['x'] }} 或 {{ var.key["x"] }}
  s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)\s*\[(['"])([^'\"]+)\3\]\s*\}\}/g, (_m, v, base, _q, lit) => {
    if (!varNames.includes(String(v))) return _m
    return `{{ '${base}.${lit}' | i18n }}`
  })
  // 索引动态表达式：{{ var.key[idx] }} → {{ ('key.' + idx) | i18n }}
  s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)\s*\[([^\]]+)\]\s*\}\}/g, (_m, v, base, expr) => {
    if (!varNames.includes(String(v))) return _m
    return `{{ ('${base}.' + ${expr.trim()}) | i18n }}`
  })
  // 简单属性：{{ var.key }} → {{ 'key' | i18n }}
  s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)\s*\}\}/g, (_m, v, key) => {
    if (!varNames.includes(String(v))) return _m
    return `{{ '${key}' | i18n }}`
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

function buildAliases(tsCode: string): Array<{ name: string; prefix: string | null }> {
  const sf = ts.createSourceFile('x.ts', tsCode, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const aliases = collectVarAliases(sf, 'locale', 'getLocale')
  const out: Array<{ name: string; prefix: string | null }> = []
  for (const a of aliases) out.push({ name: a.name, prefix: a.prefix })
  const rx = /\b([A-Za-z_]\w*)\s*=\s*this\.locale\.getLocale\s*\(/g
  let m: RegExpExecArray | null
  while ((m = rx.exec(tsCode))) out.push({ name: m[1], prefix: null })
  if (/this\.i18n\./.test(tsCode) && !out.find(x => x.name === 'i18n')) out.push({ name: 'i18n', prefix: null })
  if (/this\.dict\./.test(tsCode) && !out.find(x => x.name === 'dict')) out.push({ name: 'dict', prefix: null })
  return Array.from(new Set(out.map(o => JSON.stringify(o)))).map(s => JSON.parse(s))
}

function replaceTsContent(src: string): string {
  let s = src
  const aliases = buildAliases(src)
  for (const a of aliases) {
    const name = a.name
    const prefix = a.prefix ? a.prefix + '.' : ''
    // chain .replace()
    s = s.replace(new RegExp(`this\\.${name}\\.([A-Za-z0-9_.]+)((?:\\.replace\\([^)]*\\))+)`, 'g'), (_m, path, chain) => {
      const params = extractReplaceParams(chain)
      return renderTsGet(name, { keyExpr: `${prefix}${path}`, params })
    })
    // element access with string literal '...'
    s = s.replace(new RegExp(`this\\.${name}\\.([A-Za-z0-9_.]+)\\s*\\[\\s*'([^']+)'\\s*\\]`, 'g'), (_m, base, lit) => {
      return renderTsGet(name, { keyExpr: `${prefix}${base}.${lit}` })
    })
    // element access with string literal "..."
    s = s.replace(new RegExp(`this\\.${name}\\.([A-Za-z0-9_.]+)\\s*\\[\\s*\"([^\"]+)\"\\s*\\]`, 'g'), (_m, base, lit) => {
      return renderTsGet(name, { keyExpr: `${prefix}${base}.${lit}` })
    })
    // dynamic element access [expr]
    s = s.replace(new RegExp(`this\\.${name}\\.([A-Za-z0-9_.]+)\\s*\\[([^\\]]+)\\]`, 'g'), (_m, base, expr) => {
      return renderTsGet(name, { keyExpr: `'${prefix}${base}.' + ${String(expr).trim()}` })
    })
    // plain property chain (not followed by call/replace/[ or assignment)
    s = s.replace(new RegExp(`(^|[\\s,(])this\\.${name}\\.([A-Za-z0-9_.]+)(?!\\s*\\(|\\s*\\.replace|\\s*\\[|\\s*=)`, 'g'), (_m, pre, path) => {
      return `${pre}${renderTsGet(name, { keyExpr: `${prefix}${path}` })}`
    })
  }
  return s
}

function processTsFile(tsPath: string): { changed: boolean; code: string; aliases: string[]; htmlPath: string | null } {
  const before = readFile(tsPath)
  const varNames = collectGetLocalVars(before)
  let after = pruneUnused({} as any, before, varNames)
  after = replaceTsContent(after)
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

function processHtmlWithAliases(htmlPath: string, mode: 'replace' | 'restore', varNames: string[]): { changed: boolean } {
  const before = readFile(htmlPath)
  const alias = varNames.includes('i18n') ? 'i18n' : (varNames[0] || null)
  const after = mode === 'restore' ? restoreHtmlContent(before, alias) : replaceHtmlContent(before, varNames)
  if (after !== before) writeFile(htmlPath, after)
  return { changed: after !== before }
}

function main() {
  const args = process.argv.slice(2)
  let dir = process.cwd()
  let mode: 'replace' | 'restore' = 'replace'
  for (const a of args) {
    const m = a.match(/^--dir=(.+)$/)
    if (m) dir = path.isAbsolute(m[1]) ? m[1] : path.join(process.cwd(), m[1])
    const r = a.match(/^--mode=(replace|restore)$/)
    if (r) mode = r[1] as any
  }
  const tsFiles = walk(dir, p => p.endsWith('.ts'))
  const results: Array<{ file: string; type: 'ts'|'html'; changed: boolean }> = []
  for (const f of tsFiles) {
    const r = processTsFile(f)
    results.push({ file: f, type: 'ts', changed: r.changed })
    if (r.htmlPath && fs.existsSync(r.htmlPath)) {
      const hr = processHtmlWithAliases(r.htmlPath, mode, r.aliases)
      results.push({ file: r.htmlPath, type: 'html', changed: hr.changed })
    }
  }
  const changed = results.filter(r => r.changed).length
  const summary = { dir, files: results.length, changed }
  process.stdout.write(JSON.stringify({ summary, results }, null, 2) + '\n')
}

main()
