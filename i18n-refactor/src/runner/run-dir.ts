#!/usr/bin/env node
import * as fs from 'fs'
import * as path from 'path'
import ts from 'typescript'
import { config, loadConfig } from '../core/config'
import { configureLogger, info, warn } from '../util/logger'
import { setDictDir } from '../util/dict-reader'
import { processComponent, ComplexCase } from './component'
import { flattenLangFile, writeJson } from '../util/dict-flatten'
import { pruneUnused } from '../replace/prune'
import { collectVarAliases, ExternalAliasMap, VarAlias } from '../core/var-alias'

function readFile(p: string): string { return fs.readFileSync(p, 'utf8') } // 读取文本文件
let dryRun = !!config.dryRun // 干运行，从配置读取
let missingKeyCount = 0 // 静态键缺失计数
function writeFile(p: string, s: string) { if (!dryRun) fs.writeFileSync(p, s, 'utf8') } // 写出文本文件（支持 dry-run）
function walk(dir: string, filter: (p: string) => boolean): string[] { // 递归遍历目录并按过滤器收集文件
  const out: string[] = [] // 输出文件列表
  const entries = fs.readdirSync(dir, { withFileTypes: true }) // 读取目录条目
  for (const e of entries) { // 遍历条目
    if (e.name === 'node_modules' || e.name === '.git') continue // 忽略 node_modules 和 .git
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

export function processTsFile(tsPath: string, externalAliases?: ExternalAliasMap): { changed: boolean; code: string; aliases: string[]; htmlPath: string | null; complexCases: ComplexCase[] } {
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

// 旧 HTML 别名收集删除，统一由 component.ts 内部实现

function processHtmlRestore(htmlPath: string, alias: string | null): { changed: boolean } { // 仅在 restore 模式使用
  const before = readFile(htmlPath)
  const after = restoreHtmlContent(before, alias)
  if (after !== before) writeFile(htmlPath, after)
  return { changed: after !== before }
}

export function ensureAngularFiles(dictDir: string, mode: 'report'|'fix') {
  const svcPath = path.join(process.cwd(), 'src/app/i18n/index.ts')
  const pipePath = path.join(process.cwd(), 'src/app/i18n/i18n.pipe.ts')
  const hasSvc = fs.existsSync(svcPath)
  const hasPipe = fs.existsSync(pipePath)
  if (!hasSvc && mode === 'fix') {
    const svc = `import { Injectable } from '@angular/core'
import { en } from './en'
import { zh } from './zh'
@Injectable({ providedIn: 'root' })
export class I18nLocaleService {
  lang: 'zh'|'en' = 'zh'
  getLocale() { const cached = localStorage.getItem('i18n-lang'); if (cached) this.lang = cached as any; return this.lang === 'en' ? en as any : zh }
  get(key: string, params?: Record<string, unknown>) { const pack: any = this.getLocale(); const val = key.split('.').reduce((o,k)=>o?o[k]:undefined, pack); let s = typeof val === 'string' ? val : ''; if (params) { for (const [k,v] of Object.entries(params)) s = s.replace(new RegExp('\\\\{'+k+'\\\\}','g'), String(v)) } return s }
  setLang(code: 'en'|'zh') { this.lang = code; localStorage.setItem('i18n-lang', code); }
}`
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

export function emitJson(dictDir: string, outDir: string, langs: string[], arrayMode: 'nested'|'flat') {
  for (const lang of langs) {
    const fp = path.join(process.cwd(), dictDir, `${lang}.ts`)
    if (!fs.existsSync(fp)) { warn('lang file missing', { file: fp }); continue }
    const flat = flattenLangFile(fp, arrayMode)
    writeJson(path.isAbsolute(outDir) ? outDir : path.join(process.cwd(), outDir), lang, flat)
    info('json emitted', { lang, keys: Object.keys(flat).length })
  }
}

/**
 * 专门处理词条读取、拍平并写入文件的函数
 * @param dictDir 词条文件目录
 * @param outDir 输出目录
 * @param langs 语言列表
 * @param arrayMode 数组模式
 */
export async function processDictFiles(dictDir: string, outDir: string, langs: string[], arrayMode: 'nested'|'flat') {
  const { loadDictFile } = await import('../util/dict-simple')
  
  for (const lang of langs) {
    const fp = path.join(process.cwd(), dictDir, `${lang}.ts`)
    if (!fs.existsSync(fp)) { warn('lang file missing', { file: fp }); continue }
    
    try {
      // 使用新的 loadDictFile 函数读取词条文件
      const dictData = await loadDictFile(fp)
      
      // 展开对象树到键路径集合
      const flat: Record<string, any> = {}
      flattenDictObject(dictData, '', flat)
      
      // 写入JSON文件
      writeJson(path.isAbsolute(outDir) ? outDir : path.join(process.cwd(), outDir), lang, flat)
      info('dict processed and json written', { lang, file: fp, keys: Object.keys(flat).length })
    } catch (error) {
      warn('failed to process dict file', { file: fp, error: String(error) })
    }
  }
}

/**
 * 展开对象树到键路径集合
 * @param obj 对象
 * @param base 基础路径
 * @param out 输出集合
 */
function flattenDictObject(obj: any, base: string, out: Record<string, any>) {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const k of Object.keys(obj)) {
      const v = obj[k]
      const next = base ? `${base}.${k}` : k
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        flattenDictObject(v, next, out)
      } else {
        out[next] = v
      }
    }
  } else if (Array.isArray(obj)) {
    // 处理数组
    obj.forEach((item, index) => {
      const next = base ? `${base}.${index}` : `${index}`
      if (typeof item === 'object' && item !== null) {
        flattenDictObject(item, next, out)
      } else {
        out[next] = item
      }
    })
  } else {
    out[base] = obj
  }
}

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
function loadLangDict(dictDir: string, langPrefix: string, arrayMode: 'nested'|'flat'): Record<string, any> {
  const dir = path.join(process.cwd(), dictDir)
  if (!fs.existsSync(dir)) return {}
  const re = new RegExp(`^${langPrefix}[A-Za-z0-9_-]*\\.ts$`)
  const files = fs.readdirSync(dir).filter(n => re.test(n))
  let out: Record<string, any> = {}
  for (const name of files) {
    const fp = path.join(dir, name)
    const flat = flattenLangFile(fp, arrayMode)
    out = { ...out, ...flat }
  }
  return out
}
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
    const oIndexLit = s.match(/\{\{\s*[A-Za-z_]\w*\.([A-Za-z0-9_.]+)\s*\[\s*['"]([^'"]+)['"]\s*\]\s*\}\}/)
    // Replace chain: {{ alias.path.replace(...).replace(...)}}
    const oReplace = s.match(/\{\{\s*[A-Za-z_]\w*\.([A-Za-z0-9_.]+)\s*(?:\.replace\([^)]*\))+\s*\}\}/)
    const oldKey = oIndexLit ? `${oIndexLit[1]}.${oIndexLit[2]}` : (oReplace && oReplace[1]) || (oPlain && oPlain[1]) || null
    return { oldKey, newKey: n && n[1] || null }
  }
}
function valueOf(map: Record<string, any>, key: string | null): string | null {
  if (!key) return null
  const v = map[key]
  if (v === undefined) return null
  return Array.isArray(v) ? JSON.stringify(v) : String(v)
}

export function main() {
  const args = process.argv.slice(2) // 读取参数
  let mode: 'replace' | 'restore' | 'bootstrap' | 'delete' | 'init' | 'dict-process' = 'replace'
  const usage = `Usage: i18n-refactor [init | --mode=replace|restore|bootstrap|delete|init|dict-process] [--help] [--version]`
  const version = '0.2.0'
  for (const a of args) { // 解析参数
    if (a === 'init') mode = 'init'
    const r = a.match(/^--mode=(replace|restore|bootstrap|delete|init|dict-process)$/)
    if (r) mode = r[1] as any
    if (a === '--dry-run') dryRun = true
    if (a === '--help') { process.stdout.write(usage + '\n'); return }
    if (a === '--version') { process.stdout.write(version + '\n'); return }
  }
  dryRun = !!config.dryRun
  configureLogger({ level: config.logLevel, format: (config.format === 'json' || config.format === 'pretty' ? config.format : 'pretty') })
  setDictDir(config.dictDir || 'src/app/i18n')
  info('start', { dir: config.dir, mode, dryRun })
  if (mode === 'init') {
    const merged = loadConfig()
    const fp = path.join(process.cwd(), 'omrp.config.json')
    fs.writeFileSync(fp, JSON.stringify(merged, null, 2) + '\n', 'utf8')
    info('config initialized', { file: fp })
    return
  }
  if (mode === 'bootstrap') {
    ensureAngularFiles(config.dictDir || 'src/app/i18n', (config.ensureAngular || 'fix'))
    emitJson(config.dictDir || 'src/app/i18n', (config.jsonOutDir || 'i18n-refactor/out'), (config.languages || ['zh','en']), (config.jsonArrayMode || 'nested'))
    return
  }
  
  // 专门处理词条读取、拍平并写入文件的模式
  if (mode === 'dict-process') {
    processDictFiles(config.dictDir || 'src/app/i18n', (config.jsonOutDir || 'i18n-refactor/out'), (config.languages || ['zh','en']), (config.jsonArrayMode || 'nested'))
    return
  }
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
  const zhMap = loadLangDict(dictDir, 'zh', arrayMode)
  const enMap = loadLangDict(dictDir, 'en', arrayMode)
  const unionKeys = Array.from(new Set([...Object.keys(zhMap), ...Object.keys(enMap)]))
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
          zhBefore: valueOf(zhMap, bk),
          enBefore: valueOf(enMap, bk),
          zhAfter: valueOf(zhMap, ak),
          enAfter: valueOf(enMap, ak)
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
          zhBefore: valueOf(zhMap, bk),
          enBefore: valueOf(enMap, bk),
          zhAfter: valueOf(zhMap, ak),
          enAfter: valueOf(enMap, ak)
        }
      })
      if (tsChanges.length || (deleted && deleted.length)) details.push({ file: f, type: 'ts', changes: tsChanges, deleted })
      if (r.htmlPath && fs.existsSync(r.htmlPath)) { // 若关联模板存在
        if (mode === 'restore') {
          const hr = processHtmlRestore(r.htmlPath, 'i18n')
          results.push({ file: r.htmlPath, type: 'html', changed: hr.changed })
          const htmlLastBefore = last.htmlBefore || ''
          const htmlLastAfter = restoreHtmlContent(htmlLastBefore, 'i18n')
          const htmlDiff = diffLines(htmlLastBefore, htmlLastAfter)
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
              zhBefore: valueOf(zhMap, bk),
              enBefore: valueOf(enMap, bk),
              zhAfter: valueOf(zhMap, ak),
              enAfter: valueOf(enMap, ak)
            }
          })
          if (htmlChanges.length) details.push({ file: r.htmlPath, type: 'html', changes: htmlChanges })
        } else {
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
              zhBefore: valueOf(zhMap, bk),
              enBefore: valueOf(enMap, bk),
              zhAfter: valueOf(zhMap, ak),
              enAfter: valueOf(enMap, ak)
            }
          })
          if (htmlChanges.length) details.push({ file: r.htmlPath, type: 'html', changes: htmlChanges })
        }
      }
    }
  }
  const changed = results.filter(r => r.changed).length // 统计变更数
  const summary = { dir, files: results.length, changed, missingKeys: missingKeyCount } // 汇总信息
  if ((config.format || 'json') === 'json') process.stdout.write(JSON.stringify({ summary, results, details }, null, 2) + '\n')
  else {
    info('summary', summary)
    for (const r of results.filter(x => x.changed)) info('result', r)
  }

  // Always generate HTML report
  const outDir = path.isAbsolute((config.jsonOutDir || 'i18n-refactor/out')) ? (config.jsonOutDir as string) : path.join(process.cwd(), (config.jsonOutDir || 'i18n-refactor/out'))
  fs.mkdirSync(outDir, { recursive: true })
  const html = renderHtmlReport(summary, results.filter(r => r.changed), details, complexCases)
  const fp = path.join(outDir, 'report.html')
  fs.writeFileSync(fp, html, 'utf8')
  info('html report written', { file: fp })
}

if (require.main === module) {
}

if (require.main === module) {
  main()
}

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

export function writeHtmlReportForTest(
  outDir: string,
  summary: { dir: string; files: number; changed: number; missingKeys: number },
  results: Array<{ file: string; type: 'ts'|'html'; changed: boolean; deleted?: string[] }>,
  details: Array<{ file: string; type: 'ts'|'html'; changes: Array<{ line: number; before: string; after: string; beforeKey: string | null; afterKey: string | null; zhBefore: string | null; enBefore: string | null; zhAfter: string | null; enAfter: string | null }>; deleted?: string[] }>,
  complexCases: ComplexCase[] = []
) {
  fs.mkdirSync(outDir, { recursive: true })
  const html = renderHtmlReport(summary, results, details, complexCases)
  const fp = path.join(outDir, 'report.html')
  fs.writeFileSync(fp, html, 'utf8')
  return fp
}
