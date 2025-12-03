#!/usr/bin/env node
import * as fs from 'fs'
import * as path from 'path'
import { extractReplaceParams } from '../core/params-extractor'
import { pruneUnused } from '../replace/prune'

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

function replaceHtmlContent(src: string): string {
  let s = src
  // 链式模板替换：{{ var.key.replace('{a}', x).replace('{b}', y) }} → {{ 'key' | i18n: {a:x,b:y} }}
  s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)((?:\.replace\([^)]*\))+)[^}]*\}\}/g, (_m, _var, key, chain) => {
    const params = extractReplaceParams(chain)
    const p = Object.keys(params).length ? `: ${JSON.stringify(params)}` : ''
    return `{{ '${key}' | i18n${p} }}`
  })
  // 索引字面量：{{ var.key['x'] }} 或 {{ var.key["x"] }}
  s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)\s*\[(['"])([^'\"]+)\3\]\s*\}\}/g, (_m, _v, base, _q, lit) => {
    return `{{ '${base}.${lit}' | i18n }}`
  })
  // 索引动态表达式：{{ var.key[idx] }} → {{ ('key.' + idx) | i18n }}
  s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)\s*\[([^\]]+)\]\s*\}\}/g, (_m, _v, base, expr) => {
    return `{{ ('${base}.' + ${expr.trim()}) | i18n }}`
  })
  // 简单属性：{{ var.key }} → {{ 'key' | i18n }}
  s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)\s*\}\}/g, (_m, _v, key) => {
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
  const re = /this\.([A-Za-z_]\w*)\s*=\s*[^;]*\.getLocal\([^)]*\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(tsCode))) names.add(m[1])
  return Array.from(names)
}

function processTsFile(tsPath: string): { changed: boolean } {
  const before = readFile(tsPath)
  const varNames = collectGetLocalVars(before)
  const after = pruneUnused({} as any, before, varNames)
  if (after !== before) writeFile(tsPath, after)
  return { changed: after !== before }
}

function detectAliasName(tsPath: string): string | null { // 从同名 TS 文件检测 i18n 别名变量
  try {
    const code = readFile(tsPath)
    if (/\bi18n\s*:\s*/.test(code) || /this\.i18n\s*=/.test(code)) return 'i18n'
    if (/\bdict\s*:\s*/.test(code) || /this\.dict\s*=/.test(code)) return 'dict'
    const m = code.match(/\b([A-Za-z_]\w*)\s*=\s*this\.locale\.getLocale\s*\(/)
    if (m) return m[1]
    return null
  } catch { return null }
}

function processHtmlFile(htmlPath: string, mode: 'replace' | 'restore'): { changed: boolean } {
  const before = readFile(htmlPath)
  const tsPath = htmlPath.replace(/\.html$/, '.ts')
  const alias = detectAliasName(tsPath)
  const after = mode === 'restore' ? restoreHtmlContent(before, alias) : replaceHtmlContent(before)
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
  const htmlFiles = walk(dir, p => p.endsWith('.html'))
  const results: Array<{ file: string; type: 'ts'|'html'; changed: boolean }> = []
  for (const f of tsFiles) {
    const r = processTsFile(f)
    results.push({ file: f, type: 'ts', changed: r.changed })
  }
  for (const f of htmlFiles) {
    const r = processHtmlFile(f, mode)
    results.push({ file: f, type: 'html', changed: r.changed })
  }
  const changed = results.filter(r => r.changed).length
  const summary = { dir, files: results.length, changed }
  process.stdout.write(JSON.stringify({ summary, results }, null, 2) + '\n')
}

main()
