#!/usr/bin/env node
import * as fs from 'fs' // 文件系统，用于读写
import * as path from 'path' // 路径工具，用于定位
import ts from 'typescript' // TypeScript AST 解析
import { extractReplaceParams } from '../core/params-extractor' // 提取 replace 参数对象
import { pruneUnused } from '../replace/prune' // 清理无用别名声明/赋值
import { collectVarAliases } from '../core/var-alias' // AST 收集别名信息
import { renderTsGet } from '../replace/ts-replace' // 渲染 TS 调用 this.<alias>.get
import { pickRoot, setDictDir, hasKey } from '../util/dict-reader' // 选择字典根与设置字典目录与键校验
import { collectTemplateUsages } from '../core/template-usage'
import { renderHtmlPipe } from '../replace/html-replace'
import { config } from '../core/config' // 统一配置
import { configureLogger, info, warn, debug } from '../util/logger' // 日志
import { flattenLangFile, writeJson } from '../util/dict-flatten'

function readFile(p: string): string { return fs.readFileSync(p, 'utf8') } // 读取文本文件
let dryRun = false // 干运行，默认关闭
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

function replaceHtmlContent(src: string, aliasInfos: Array<{ name: string; roots?: string[]; prefix?: string | null }>): string {
  const info = new Map<string, { roots?: string[]; prefix?: string | null }>()
  for (const a of aliasInfos) info.set(a.name, { roots: a.roots, prefix: a.prefix })
  const varNames = aliasInfos.map(a => a.name)
  const uses = collectTemplateUsages(src, varNames)
  const computeKeyExpr = (u: { keyExpr: string; dynamicSegments?: string[] }, ai?: { roots?: string[]; prefix?: string | null }): string => {
    if (!ai) return u.keyExpr
    // 动态：`'base.' + expr` → 加根前缀
    if (u.dynamicSegments && u.dynamicSegments.length) {
      const m = u.keyExpr.match(/^'([^']+)\.'\s*\+\s*(.+)$/)
      if (m) {
        const base = m[1]
        const rp = ai.roots && ai.roots.length ? pickRoot(ai.roots, base) : ''
        const rootPrefix = rp ? rp + '.' : (ai.prefix ? ai.prefix + '.' : '')
        return `'${rootPrefix}${base}.' + ${m[2]}`
      }
      return u.keyExpr
    }
    // 静态：加根前缀或选根
    const path = u.keyExpr
    if (ai.prefix) return `${ai.prefix}.${path}`
    if (ai.roots && ai.roots.length) {
      const rp = pickRoot(ai.roots, path)
      return rp ? `${rp}.${path}` : path
    }
    return path
  }
  // 生成替换片段
  const reps = uses.map(u => {
    const ai = info.get(u.varName)
    const keyExpr = computeKeyExpr(u, ai)
    const pipe = renderHtmlPipe({ ...u, keyExpr })
    return { s: u.start!, e: u.end!, text: pipe }
  }).sort((a, b) => b.s - a.s)
  // 应用替换
  let out = src
  for (const r of reps) out = out.slice(0, r.s) + r.text + out.slice(r.e)
  return out
}

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

export function processTsFile(tsPath: string): { changed: boolean; code: string; aliases: string[]; htmlPath: string | null } {
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
  // normalize constructor to inject I18nLocaleService as i18n
  after = after.replace(/constructor\s*\(([^)]*)\)/, (m, params) => {
    let p = params
    p = p.replace(/\b(private|public)?\s*locale\s*:\s*I18nLocaleService\b/, 'public i18n: I18nLocaleService')
    return `constructor(${p})`
  })
  // remove remaining getLocale/getLocal assignments
  after = after.replace(/this\.[A-Za-z_]\w*\s*=\s*[^;]*\.(?:getLocal|getLocale)\([^)]*\)(?:\.[A-Za-z0-9_.]+)?\s*;?/g, '')
  const sf = ts.createSourceFile(tsPath, after, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const aliases = collectVarAliases(sf, config.fallbackServiceParamName, config.getLocalMethod).map(a => a.name)
  // also include direct assignments from locale.getLocale()
  const rx = new RegExp(`\\b([A-Za-z_]\\w*)\\s*=\\s*this\\.${config.fallbackServiceParamName}\\.${config.getLocalMethod}\\s*\\(`, 'g')
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
    const aliases = collectVarAliases(sf, config.fallbackServiceParamName, config.getLocalMethod)
    const names = new Set<string>()
    for (const a of aliases) names.add(a.name)
    const rx = new RegExp(`\\b([A-Za-z_]\\w*)\\s*=\\s*this\\.${config.fallbackServiceParamName}\\.${config.getLocalMethod}\\s*\\(`, 'g')
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

function main() { // CLI 主入口
  const args = process.argv.slice(2) // 读取参数
  let dir = process.cwd() // 默认目录为当前工作目录
  let mode: 'replace' | 'restore' = 'replace' // 默认模式为替换
  let logLevel: 'debug' | 'info' | 'warn' | 'error' | undefined
  let outFormat: 'json' | 'pretty' | undefined
  const usage = `Usage: i18n-refactor [--dir=PATH] [--mode=replace|restore] [--dictDir=PATH] [--dry-run] [--logLevel=debug|info|warn|error] [--format=json|pretty] [--config=PATH] [--help] [--version]`
  const version = '0.1.0'
  let exec: 'bootstrap' | null = null
  for (const a of args) { // 解析参数
    const m = a.match(/^--dir=(.+)$/) // 指定目录
    if (m) dir = path.isAbsolute(m[1]) ? m[1] : path.join(process.cwd(), m[1]) // 解析绝对/相对路径
    const r = a.match(/^--mode=(replace|restore)$/) // 指定模式
    if (r) mode = r[1] as any // 设置模式
    const d = a.match(/^--dictDir=(.+)$/) // 指定字典目录
    if (d) setDictDir(d[1]) // 设置目录
    const dl = a.match(/^--logLevel=(debug|info|warn|error)$/)
    if (dl) logLevel = dl[1] as any
    const fm = a.match(/^--format=(json|pretty)$/)
    if (fm) outFormat = fm[1] as any
    if (a === '--dry-run') dryRun = true
    const cf = a.match(/^--config=(.+)$/)
    if (cf) {
      try {
        const p = path.isAbsolute(cf[1]) ? cf[1] : path.join(process.cwd(), cf[1])
        const txt = fs.readFileSync(p, 'utf8')
        const obj = JSON.parse(txt)
        if (obj.serviceTypeName) (config as any).serviceTypeName = obj.serviceTypeName
        if (obj.getLocalMethod) (config as any).getLocalMethod = obj.getLocalMethod
        if (obj.fallbackServiceParamName) (config as any).fallbackServiceParamName = obj.fallbackServiceParamName
        if (obj.tsGetHelperName) (config as any).tsGetHelperName = obj.tsGetHelperName
        if (obj.dictDir) (config as any).dictDir = obj.dictDir
        if (obj.languages) (config as any).languages = obj.languages
        if (obj.jsonOutDir) (config as any).jsonOutDir = obj.jsonOutDir
        if (obj.jsonArrayMode) (config as any).jsonArrayMode = obj.jsonArrayMode
        if (obj.ensureAngular) (config as any).ensureAngular = obj.ensureAngular
        info('config loaded', { path: p })
      } catch (e) {
        warn('config load failed', {})
      }
    }
    const ex = a.match(/^--exec=(bootstrap)$/)
    if (ex) exec = ex[1] as any
    if (a === '--help') { process.stdout.write(usage + '\n'); return }
    if (a === '--version') { process.stdout.write(version + '\n'); return }
  }
  configureLogger({ level: logLevel, format: outFormat })
  info('start', { dir, mode, dryRun })
  if (exec === 'bootstrap') {
    ensureAngularFiles(config.dictDir || 'src/app/i18n', (config.ensureAngular || 'fix'))
    emitJson(config.dictDir || 'src/app/i18n', (config.jsonOutDir || 'i18n-refactor/out'), (config.languages || ['zh','en']), (config.jsonArrayMode || 'nested'))
    return
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
  const summary = { dir, files: results.length, changed, missingKeys: missingKeyCount } // 汇总信息
  if ((outFormat || 'json') === 'json') process.stdout.write(JSON.stringify({ summary, results }, null, 2) + '\n')
  else {
    info('summary', summary)
    for (const r of results) info('result', r)
  }
}

if (require.main === module) {
  main() // 执行主程序
}
