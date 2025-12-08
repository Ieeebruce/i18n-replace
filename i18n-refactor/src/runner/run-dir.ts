#!/usr/bin/env node
import * as fs from 'fs' // 文件系统，用于读写
import * as path from 'path' // 路径工具，用于定位
import ts from 'typescript' // TypeScript AST 解析
import { config } from '../core/config' // 统一配置（固定从 omrp.config.json 加载）
import { configureLogger, info, warn } from '../util/logger' // 日志
import { setDictDir } from '../util/dict-reader' // 设置字典目录（用于 pickRoot/hasKey 等工具）
import { processComponent } from './component' // 复用 UT 使用的组件处理逻辑
import { flattenLangFile, writeJson } from '../util/dict-flatten'

function readFile(p: string): string { return fs.readFileSync(p, 'utf8') } // 读取文本文件
let dryRun = !!config.dryRun // 干运行，从配置读取
let missingKeyCount = 0 // 静态键缺失计数
function writeFile(p: string, s: string) { if (!dryRun) fs.writeFileSync(p, s, 'utf8') } // 写出文本文件（支持 dry-run）
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

// 旧 HTML 替换实现删除，统一复用 component.ts 中的实现

function toReplaceChain(params: Record<string, string>): string { // 将对象 {k:expr} 转回 .replace 链
  let chain = ''
  for (const k of Object.keys(params)) {
    chain += `.replace('{${k}}', ${params[k]})`
  }
  return chain
}

function parseObjectLiteralText(objText: string): Record<string, string> { // 使用 TS AST 解析对象字面量
  const sf = ts.createSourceFile('o.ts', `const __x = ${objText};`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const out: Record<string, string> = {}
  const visit = (node: ts.Node) => {
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (decl.initializer && ts.isObjectLiteralExpression(decl.initializer)) {
          for (const prop of decl.initializer.properties) {
            if (!ts.isPropertyAssignment(prop)) continue
            const key = ts.isIdentifier(prop.name) ? prop.name.text : ts.isStringLiteral(prop.name) ? prop.name.text : ''
            if (!key) continue
            const val = prop.initializer.getText(sf)
            out[key] = val
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

function restoreHtmlContent(src: string, alias: string | null): string { // 将管道表达式还原为变量访问与 .replace 链
  const varName = alias || 'i18n'
  let s = src
  // 还原：{{ 'a.b.c' | i18n: {k:expr} }} → {{ varName.a.b.c.replace('{k}', expr) }}
  s = s.replace(/\{\{\s*'([A-Za-z0-9_.]+)'\s*\|\s*i18n\s*:\s*(\{[^}]*\})\s*\}\}/g, (_m, key, obj) => {
    try {
      const parsed = parseObjectLiteralText(obj)
      const chain = toReplaceChain(parsed)
      return `{{ ${varName}.${key}${chain} }}`
    } catch {
      warn('restoreHtml parse params failed', { key })
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
  const re = new RegExp(`this\\.([A-Za-z_]\\w*)\\s*=\\s*[^;]*\\.${config.getLocalMethod}\\([^)]*\\)`, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(tsCode))) names.add(m[1])
  return Array.from(names)
}

/*
function buildAliases(tsCode: string): Array<{ name: string; prefix: string | null; roots?: string[] }> {
  const sf = ts.createSourceFile('x.ts', tsCode, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const aliases = collectVarAliases(sf, config.fallbackServiceParamName, config.getLocalMethod)
  const out: Array<{ name: string; prefix: string | null; roots?: string[] }> = []
  for (const a of aliases) out.push({ name: a.name, prefix: a.prefix, roots: a.roots })
  const rx = new RegExp(`\\b([A-Za-z_]\\w*)\\s*=\\s*this\\.${config.fallbackServiceParamName}\\.${config.getLocalMethod}\\s*\\(`, 'g')
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
  // AST-based replacement for plain property chains this.<alias>.<path>
  const sfAst = ts.createSourceFile('x.ts', s, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  type Rep = { s: number; e: number; text: string }
  const reps: Rep[] = []
  const info = new Map<string, { prefix: string | null; roots?: string[] }>()
  for (const a of aliases) info.set(a.name, { prefix: a.prefix, roots: a.roots })
  const composeAstKey = (a: { prefix: string | null; roots?: string[] }, path: string) => {
    if (a.prefix) return `${a.prefix}.${path}`
    if (a.roots && a.roots.length) { const r = pickRoot(a.roots, path); return r ? `${r}.${path}` : path }
    return path
  }
  const auditStaticKey = (a: { prefix: string | null; roots?: string[] }, path: string) => {
    let root = ''
    if (a.prefix) { const seg = a.prefix.split('.')[0]; root = seg }
    else if (a.roots && a.roots.length) root = pickRoot(a.roots, path)
    if (root) { const ok = hasKey(root, path); if (!ok) { missingKeyCount++; warn('missing i18n key', { root, path }) } }
  }
  const visitAst = (node: ts.Node) => {
    if (ts.isPropertyAccessExpression(node)) {
      let outer: ts.PropertyAccessExpression = node
      while (ts.isPropertyAccessExpression(outer.parent) && outer.parent.expression === outer) outer = outer.parent
      let cur: ts.Expression = outer
      const segs: string[] = []
      while (ts.isPropertyAccessExpression(cur)) { segs.unshift(cur.name.getText(sfAst)); cur = cur.expression }
      if (ts.isPropertyAccessExpression(cur) && cur.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isIdentifier(cur.name)) {
        const aliasName = cur.name.getText(sfAst)
        const ai = info.get(aliasName)
        if (ai) {
          const p = outer.parent
          const isCall = ts.isCallExpression(p) && p.expression === outer
          const isEl = ts.isElementAccessExpression(p) && p.expression === outer
          const isAssignLHS = ts.isBinaryExpression(p) && p.left === outer
          const isReplaceChain = ts.isPropertyAccessExpression(p) && p.name.getText(sfAst) === 'replace'
          if (!isCall && !isEl && !isAssignLHS && !isReplaceChain) {
            const path = segs.join('.')
            const text = renderTsGet(aliasName, { keyExpr: composeAstKey(ai, path) })
            auditStaticKey(ai, path)
            reps.push({ s: outer.getStart(sfAst), e: outer.getEnd(), text })
          }
        }
      }
    }
    ts.forEachChild(node, visitAst)
  }
  visitAst(sfAst)
  if (reps.length) {
    reps.sort((a, b) => b.s - a.s)
    for (const r of reps) s = s.slice(0, r.s) + r.text + s.slice(r.e)
  }
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
  s = s.replace(new RegExp(`this\\.${name}\\.([A-Za-z0-9_.]+)((?:\\.replace\\([^)]*\\))+)`, 'g'), (_m, path, chain) => {
    const params = extractReplaceParams(chain)
    auditStaticKey(a, String(path))
    return renderTsGet(name, { keyExpr: composeKey(String(path)), params })
  })
    // element access with string literal '...'
  s = s.replace(new RegExp(`this\\.${name}\\.([A-Za-z0-9_.]+)\\s*\\[\\s*'([^']+)'\\s*\\]`, 'g'), (_m, base, lit) => {
    auditStaticKey(a, String(base) + '.' + String(lit))
    return renderTsGet(name, { keyExpr: composeKey(`${String(base)}.${String(lit)}`) })
  })
    // element access with string literal "..."
  s = s.replace(new RegExp(`this\\.${name}\\.([A-Za-z0-9_.]+)\\s*\\[\\s*\"([^\"]+)\"\\s*\\]`, 'g'), (_m, base, lit) => {
    auditStaticKey(a, String(base) + '.' + String(lit))
    return renderTsGet(name, { keyExpr: composeKey(`${String(base)}.${String(lit)}`) })
  })
    // dynamic element access [expr]
  s = s.replace(new RegExp(`this\\.${name}\\.([A-Za-z0-9_.]+)\\s*\\[([^\\]]+)\\]`, 'g'), (_m, base, expr) => {
    const basePath = composeKey(String(base))
    return renderTsGet(name, { keyExpr: `'${basePath}.' + ${String(expr).trim()}` })
  })
  }
  // Fallback: plain property chains not followed by call/replace/[ or assignment
  for (const a of aliases) {
    const name = a.name
    const composeKey = (path: string) => {
      if (a.prefix) return `${a.prefix}.${path}`
      if (a.roots && a.roots.length) { const r = pickRoot(a.roots, path); return r ? `${r}.${path}` : path }
      return path
    }
  s = s.replace(new RegExp(`this\\.${name}\\.(?!get\\b)([A-Za-z0-9_.]+)(?!\\s*\\(|\\s*\\.replace|\\s*\\[|\\s*=)`, 'g'), (_m, path) => {
    auditStaticKey(a, String(path))
    return renderTsGet(name, { keyExpr: composeKey(String(path)) })
  })
  }
  return s
}

*/
export function processTsFile(tsPath: string): { changed: boolean; code: string; aliases: string[]; htmlPath: string | null } {
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
  const { tsOut, htmlOut } = processComponent(before, htmlBefore, tsPath)
  const changedTs = tsOut !== before
  const changedHtml = htmlPath ? (htmlOut !== htmlBefore) : false
  if (changedTs) writeFile(tsPath, tsOut)
  if (htmlPath && changedHtml) writeFile(htmlPath, htmlOut)
  const aliases: string[] = []
  return { changed: changedTs || changedHtml, code: tsOut, aliases, htmlPath }
}

// 旧 HTML 别名收集删除，统一由 component.ts 内部实现

function processHtmlRestore(htmlPath: string, alias: string | null): { changed: boolean } { // 仅在 restore 模式使用
  const before = readFile(htmlPath)
  const after = restoreHtmlContent(before, alias)
  if (after !== before) writeFile(htmlPath, after)
  return { changed: after !== before }
}

function ensureAngularFiles(dictDir: string, mode: 'report'|'fix') {
  const svcPath = path.join(process.cwd(), 'src/app/i18n/index.ts')
  const pipePath = path.join(process.cwd(), 'src/app/i18n/i18n.pipe.ts')
  const hasSvc = fs.existsSync(svcPath)
  const hasPipe = fs.existsSync(pipePath)
  if (!hasSvc && mode === 'fix') {
    const svc = `import { Injectable } from '@angular/core'\nimport { en } from './en'\nimport { zh } from './zh'\n@Injectable({ providedIn: 'root' })\nexport class I18nLocaleService {\n  lang: 'zh'|'en' = 'zh'\n  getLocale() { const cached = localStorage.getItem('i18n-lang'); if (cached) this.lang = cached as any; return this.lang === 'en' ? en as any : zh }\n  get(key: string, params?: Record<string, unknown>) { const pack: any = this.getLocale(); const val = key.split('.').reduce((o,k)=>o?o[k]:undefined, pack); let s = typeof val === 'string' ? val : ''; if (params) { for (const [k,v] of Object.entries(params)) s = s.replace(new RegExp('\\\\{'+k+'\\\\}','g'), String(v)) } return s }\n  setLang(code: 'en'|'zh') { this.lang = code; localStorage.setItem('i18n-lang', code); }\n}`
    fs.mkdirSync(path.dirname(svcPath), { recursive: true }); fs.writeFileSync(svcPath, svc, 'utf8'); info('created service', { file: svcPath })
  } else if (!hasSvc) warn('missing service', { suggest: 'create src/app/i18n/index.ts' })
  if (!hasPipe && mode === 'fix') {
    const pipe = `import { Pipe, PipeTransform } from '@angular/core'\nimport { I18nLocaleService } from './index'\n@Pipe({ name: 'i18n', standalone: true })\nexport class I18nPipe implements PipeTransform { constructor(private locale: I18nLocaleService){} transform(key: string, params?: Record<string, unknown>) { return this.locale.get(key, params) } }`
    fs.mkdirSync(path.dirname(pipePath), { recursive: true }); fs.writeFileSync(pipePath, pipe, 'utf8'); info('created pipe', { file: pipePath })
  } else if (!hasPipe) warn('missing pipe', { suggest: 'create src/app/i18n/i18n.pipe.ts' })
  const appComp = path.join(process.cwd(), 'src/app/app.component.ts')
  if (fs.existsSync(appComp)) {
    let s = readFile(appComp)
    if (!/I18nPipe/.test(s)) {
      if (mode === 'fix') {
        const lastImport = s.lastIndexOf('import ')
        const eol = s.indexOf('\n', lastImport)
        if (eol >= 0) s = s.slice(0, eol + 1) + `import { I18nPipe } from './i18n/i18n.pipe'\n` + s.slice(eol + 1)
        s = s.replace(/imports:\s*\[([^\]]*)\]/, (_m, inside) => `imports: [${inside} , I18nPipe]`)
        writeFile(appComp, s); info('imported pipe globally', { file: appComp })
      } else warn('pipe not globally imported', { file: appComp })
    }
  }
}

function emitJson(dictDir: string, outDir: string, langs: string[], arrayMode: 'nested'|'flat') {
  for (const lang of langs) {
    const fp = path.join(process.cwd(), dictDir, `${lang}.ts`)
    if (!fs.existsSync(fp)) { warn('lang file missing', { file: fp }); continue }
    const flat = flattenLangFile(fp, arrayMode)
    writeJson(path.isAbsolute(outDir) ? outDir : path.join(process.cwd(), outDir), lang, flat)
    info('json emitted', { lang, keys: Object.keys(flat).length })
  }
}

function main() { // CLI 主入口（仅允许 --mode，其余参数从 omrp.config.json 读取）
  const args = process.argv.slice(2) // 读取参数
  let mode: 'replace' | 'restore' | 'bootstrap' = 'replace' // 默认模式
  const usage = `Usage: i18n-refactor [--mode=replace|restore|bootstrap] [--help] [--version]`
  const version = '0.2.0'
  for (const a of args) { // 解析参数
    const r = a.match(/^--mode=(replace|restore|bootstrap)$/)
    if (r) mode = r[1] as any
    if (a === '--help') { process.stdout.write(usage + '\n'); return }
    if (a === '--version') { process.stdout.write(version + '\n'); return }
  }
  dryRun = !!config.dryRun
  configureLogger({ level: config.logLevel, format: config.format })
  setDictDir(config.dictDir || 'src/app/i18n')
  info('start', { dir: config.dir, mode, dryRun })
  if (mode === 'bootstrap') {
    ensureAngularFiles(config.dictDir || 'src/app/i18n', (config.ensureAngular || 'fix'))
    emitJson(config.dictDir || 'src/app/i18n', (config.jsonOutDir || 'i18n-refactor/out'), (config.languages || ['zh','en']), (config.jsonArrayMode || 'nested'))
    return
  }
  const dir = config.dir || process.cwd()
  const tsFiles = walk(dir, p => p.endsWith('.ts')) // 收集 TS 文件
  const results: Array<{ file: string; type: 'ts'|'html'; changed: boolean }> = [] // 结果列表
  for (const f of tsFiles) { // 遍历 TS
    const r = processTsFile(f) // 处理 TS 文件
    results.push({ file: f, type: 'ts', changed: r.changed }) // 记录结果
    if (r.htmlPath && fs.existsSync(r.htmlPath)) { // 若关联模板存在
      if (mode === 'restore') {
        const hr = processHtmlRestore(r.htmlPath, 'i18n')
        results.push({ file: r.htmlPath, type: 'html', changed: hr.changed })
      }
    }
  }
  const changed = results.filter(r => r.changed).length // 统计变更数
  const summary = { dir, files: results.length, changed, missingKeys: missingKeyCount } // 汇总信息
  if ((config.format || 'json') === 'json') process.stdout.write(JSON.stringify({ summary, results }, null, 2) + '\n')
  else {
    info('summary', summary)
    for (const r of results) info('result', r)
  }
}

if (require.main === module) {
  main() // 执行主程序
}
