import ts from 'typescript'
import { collectVarAliases } from '../core/var-alias'
import { extractReplaceParams } from '../core/params-extractor'
import { renderTsGet } from '../replace/ts-replace'
import { pruneUnused } from '../replace/prune'
import { pickRoot } from '../util/dict-reader'

function collectGetLocaleVars(code: string): string[] {
  const names = new Set<string>()
  const reA = /this\.([A-Za-z_]\w*)\s*=\s*[^;]*\.getLocale\([^)]*\)/g
  const reB = /this\.([A-Za-z_]\w*)\s*=\s*[^;]*\.getLocal\([^)]*\)/g
  let m: RegExpExecArray | null
  while ((m = reA.exec(code))) names.add(m[1])
  while ((m = reB.exec(code))) names.add(m[1])
  return Array.from(names)
}

type AliasInfo = { name: string; prefix: string | null; roots?: string[] }
function buildAliases(code: string): AliasInfo[] {
  const sf = ts.createSourceFile('x.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const raw = collectVarAliases(sf, 'locale', 'getLocale')
  const out: AliasInfo[] = []
  for (const a of raw) {
    out.push({ name: a.name, prefix: a.prefix, roots: a.roots })
  }
  const rx = /\b([A-Za-z_]\w*)\s*=\s*this\.locale\.getLocale\s*\(/g
  let m: RegExpExecArray | null
  while ((m = rx.exec(code))) out.push({ name: m[1], prefix: null })
  if (/\bi18n\s*:\s*/.test(code) || /this\.i18n\s*=/.test(code)) out.push({ name: 'i18n', prefix: null })
  if (/\bdict\s*:\s*/.test(code) || /this\.dict\s*=/.test(code)) out.push({ name: 'dict', prefix: null })
  const rxAny = /this\.([A-Za-z_]\w*)\./g
  let am: RegExpExecArray | null
  while ((am = rxAny.exec(code))) {
    const nm = am[1]
    if (nm !== 'locale') out.push({ name: nm, prefix: null })
  }
  // de-duplicate by name, prefer non-null prefix
  const map = new Map<string, AliasInfo>()
  for (const a of out) {
    const prev = map.get(a.name)
    if (!prev || (a.prefix && !prev.prefix)) map.set(a.name, a)
  }
  return Array.from(map.values())
}

function replaceTs(src: string): string {
  let s = src
  const aliases = buildAliases(src)
  const composeKey = (ai: AliasInfo, path: string) => {
    if (ai.prefix) {
      const rootFirst = ai.prefix.split('.')[0]
      if (path.startsWith(rootFirst + '.')) path = path.slice(rootFirst.length + 1)
      return `${ai.prefix}.${path}`
    }
    if (ai.roots && ai.roots.length) {
      const r = pickRoot(ai.roots, path)
      return r ? `${r}.${path}` : path
    }
    return path
  }
  for (const ai of aliases) {
    const name = ai.name
    s = s.replace(new RegExp(`this\\.${name}\\.([A-Za-z0-9_.]+)((?:\\.replace\\([^)]*\\))+)`, 'g'), (_m, path, chain) => {
      const params = extractReplaceParams(chain)
      return renderTsGet(name, { keyExpr: composeKey(ai, String(path)), params })
    })
    s = s.replace(new RegExp(`this\\.${name}\\.([A-Za-z0-9_.]+)\\s*\\[\\s*'([^']+)'\\s*\\]`, 'g'), (_m, base, lit) => {
      const path = `${String(base)}.${String(lit)}`
      return renderTsGet(name, { keyExpr: composeKey(ai, path) })
    })
    s = s.replace(new RegExp(`this\\.${name}\\.([A-Za-z0-9_.]+)\\s*\\[\\s*\"([^\"]+)\"\\s*\\]`, 'g'), (_m, base, lit) => {
      const path = `${String(base)}.${String(lit)}`
      return renderTsGet(name, { keyExpr: composeKey(ai, path) })
    })
    s = s.replace(new RegExp(`this\\.${name}\\.([A-Za-z0-9_.]+)\\s*\\[([^\\]]+)\\]`, 'g'), (_m, base, expr) => {
      const basePath = composeKey(ai, String(base))
      return renderTsGet(name, { keyExpr: `'${basePath}.' + ${String(expr).trim()}` })
    })
    s = s.replace(new RegExp(`this\\.${name}\\.(?!get\\b)([A-Za-z0-9_.]+)(?!\\s*\\(|\\s*\\.replace|\\s*\\[|\\s*=)`, 'g'), (_m, path) => {
      return renderTsGet(name, { keyExpr: composeKey(ai, String(path)) })
    })
  }
  return s
}

function replaceHtml(src: string, aliases: AliasInfo[]): string {
  let s = src
  const info = new Map<string, AliasInfo>()
  for (const a of aliases) info.set(a.name, a)
  s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)((?:\.replace\([^)]*\))+)[^}]*\}\}/g, (_m, v, key, chain) => {
    const ai = info.get(String(v))
    if (!ai) return _m
    const rp = ai.roots && ai.roots.length ? pickRoot(ai.roots, String(key)) : ''
    const rootPrefix = rp ? rp + '.' : ''
    const params = extractReplaceParams(chain)
    const p = Object.keys(params).length ? `: ${JSON.stringify(params)}` : ''
    return `{{ '${rootPrefix}${key}' | i18n${p} }}`
  })
  s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)\s*\[(['"])([^'\"]+)\3\]\s*\}\}/g, (_m, v, base, _q, lit) => {
    const ai = info.get(String(v))
    if (!ai) return _m
    const rp = ai.roots && ai.roots.length ? pickRoot(ai.roots, String(base)) : ''
    const rootPrefix = rp ? rp + '.' : ''
    return `{{ '${rootPrefix}${base}.${lit}' | i18n }}`
  })
  s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)\s*\[([^\]]+)\]\s*\}\}/g, (_m, v, base, expr) => {
    const ai = info.get(String(v))
    if (!ai) return _m
    const rp = ai.roots && ai.roots.length ? pickRoot(ai.roots, String(base)) : ''
    const rootPrefix = rp ? rp + '.' : ''
    return `{{ ('${rootPrefix}${base}.' + ${expr.trim()}) | i18n }}`
  })
  s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)\s*\}\}/g, (_m, v, key) => {
    const ai = info.get(String(v))
    if (!ai) return _m
    const rp = ai.roots && ai.roots.length ? pickRoot(ai.roots, String(key)) : ''
    const rootPrefix = rp ? rp + '.' : ''
    return `{{ '${rootPrefix}${key}' | i18n }}`
  })
  return s
}

export function processComponent(tsCode: string, htmlCode: string): { tsOut: string, htmlOut: string } {
  const varNames = collectGetLocaleVars(tsCode)
  let tsOut = pruneUnused({} as any, tsCode, varNames)
  tsOut = replaceTs(tsOut)
  tsOut = tsOut.replace(/this\.[A-Za-z_]\w*\s*=\s*[^;]*\.(?:getLocal|getLocale)\([^)]*\)(?:\.[A-Za-z0-9_.]+)?\s*;?/g, '')
  // unify all alias get-calls to this.i18n.get(...)
  const aliasInfos = buildAliases(tsOut)
  for (const ai of aliasInfos) {
    if (ai.name !== 'i18n') {
      tsOut = tsOut.replace(new RegExp(`this\\.${ai.name}\\\.get(?!Locale)\\s*\\(`, 'g'), 'this.i18n.get(')
      // remove leftover declarations of alias variables
      tsOut = tsOut.replace(new RegExp(`\\b${ai.name}\\s*:\\s*any\\s*;`, 'g'), '')
    }
  }
  // normalize constructor to inject I18nService
  tsOut = tsOut.replace(/constructor\s*\(([^)]*)\)/, (m, params) => {
    let p = params
    // replace old locale service param to new i18n service
    p = p.replace(/\b(private|public)?\s*locale\s*:\s*I18nLocaleService\b/, 'public i18n: I18nService')
    // ensure i18n param exists
    if (!/I18nService\b/.test(p)) {
      p = (p.trim().length ? p + ', ' : '') + 'public i18n: I18nService'
    }
    // remove obsolete any declarations in param list if any
    return `constructor(${p})`
  })
  const htmlAliases = buildAliases(tsCode)
  const htmlOut = replaceHtml(htmlCode, htmlAliases)
  return { tsOut, htmlOut }
}
