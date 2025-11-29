import * as ts from 'typescript'
import * as fs from 'fs'
import * as path from 'path'

export const i18nAstConfig = {
  serviceTypeName: 'I18nLocaleService',
  getLocaleMethod: 'getLocale',
  getMethod: 'get',
  fallbackServiceParamName: 'locale'
}

export function createSourceFile(fileName: string, code: string): ts.SourceFile {
  return ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

export function findServiceParamName(sf: ts.SourceFile): string {
  let out: string | null = null
  function visit(node: ts.Node): void {
    if (ts.isConstructorDeclaration(node)) {
      for (const p of node.parameters) {
        if (p.type && ts.isTypeReferenceNode(p.type) && p.type.typeName && p.type.typeName.getText(sf) === i18nAstConfig.serviceTypeName) {
          const nm = p.name.getText(sf)
          out = nm
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out || i18nAstConfig.fallbackServiceParamName
}

function isGetLocaleCall(sf: ts.SourceFile, expr: ts.Expression, serviceName: string): boolean {
  if (!expr || !ts.isCallExpression(expr)) return false
  const ex = expr.expression
  return ts.isPropertyAccessExpression(ex) && ex.name.getText(sf) === i18nAstConfig.getLocaleMethod && ts.isPropertyAccessExpression(ex.expression) && ex.expression.expression && ex.expression.expression.kind === ts.SyntaxKind.ThisKeyword && ex.expression.name.getText(sf) === serviceName
}

function isServiceGetCall(sf: ts.SourceFile, expr: ts.Expression, serviceName: string): boolean {
  if (!expr || !ts.isCallExpression(expr)) return false
  const ex = expr.expression
  return ts.isPropertyAccessExpression(ex) && ex.name.getText(sf) === i18nAstConfig.getMethod && ts.isPropertyAccessExpression(ex.expression) && ex.expression.expression && ex.expression.expression.kind === ts.SyntaxKind.ThisKeyword && ex.expression.name.getText(sf) === serviceName
}

function isVarRootAccess(sf: ts.SourceFile, expr: ts.Expression, localeVars: Set<string>): boolean {
  if (!expr || !ts.isPropertyAccessExpression(expr)) return false
  const base = expr.expression
  return ts.isPropertyAccessExpression(base) && base.expression && base.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isIdentifier(base.name) && localeVars.has(base.name.getText(sf))
}

export function findLocaleVarNames(sf: ts.SourceFile, serviceName: string): string[] {
  const out = new Set<string>()
  const localeVars = new Set<string>()
  function visit(node: ts.Node): void {
    if (ts.isPropertyDeclaration(node) && node.initializer && isGetLocaleCall(sf, node.initializer, serviceName)) {
      if (node.name && ts.isIdentifier(node.name)) {
        out.add(node.name.getText(sf))
        localeVars.add(node.name.getText(sf))
      }
    }
    if (ts.isPropertyDeclaration(node) && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      const spreads = node.initializer.properties.filter(p => ts.isSpreadAssignment(p)) as ts.SpreadAssignment[]
      const hasServiceGet = spreads.some(sp => isServiceGetCall(sf, sp.expression, serviceName))
      const hasVarRootAccess = spreads.some(sp => isVarRootAccess(sf, sp.expression, localeVars))
      if (hasServiceGet || hasVarRootAccess) {
        if (node.name && ts.isIdentifier(node.name)) out.add(node.name.getText(sf))
      }
    }
    if (ts.isMethodDeclaration(node) && node.body && node.name && ts.isIdentifier(node.name)) {
      const ret = node.body.statements.find(s => ts.isReturnStatement(s)) as ts.ReturnStatement | undefined
      if (ret && ret.expression && isGetLocaleCall(sf, ret.expression, serviceName)) out.add(node.name.getText(sf))
    }
    if (ts.isConstructorDeclaration(node)) {
      for (const s of node.body ? node.body.statements : []) {
        if (ts.isExpressionStatement(s) && ts.isBinaryExpression(s.expression)) {
          const be = s.expression
          if (be.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(be.left) && be.left.expression && be.left.expression.kind === ts.SyntaxKind.ThisKeyword && isGetLocaleCall(sf, be.right, serviceName)) {
            if (ts.isIdentifier(be.left.name)) {
              out.add(be.left.name.getText(sf))
              localeVars.add(be.left.name.getText(sf))
            }
          }
          if (be.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(be.left) && be.left.expression && be.left.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isObjectLiteralExpression(be.right)) {
            const spreads2 = be.right.properties.filter(p => ts.isSpreadAssignment(p)) as ts.SpreadAssignment[]
            const hasServiceGet2 = spreads2.some(sp => isServiceGetCall(sf, sp.expression, serviceName))
            const hasVarRootAccess2 = spreads2.some(sp => isVarRootAccess(sf, sp.expression, localeVars))
            if (hasServiceGet2 || hasVarRootAccess2) {
              if (ts.isIdentifier(be.left.name)) out.add(be.left.name.getText(sf))
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  if (out.size === 0) out.add('T')
  return Array.from(out).filter(n => n !== serviceName)
}

export function collectVarRootOrder(sf: ts.SourceFile, serviceName: string, varNames: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  function visit(node: ts.Node): void {
    if (ts.isPropertyDeclaration(node) && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      const spreads = node.initializer.properties.filter(p => ts.isSpreadAssignment(p)) as ts.SpreadAssignment[]
      const roots: string[] = []
      for (const sp of spreads) {
        const expr = sp.expression
        if (isServiceGetCall(sf, expr, serviceName)) {
          const arg = (expr as ts.CallExpression).arguments[0]
          if (arg && ts.isStringLiteral(arg)) roots.push(arg.text)
        } else if (ts.isPropertyAccessExpression(expr)) {
          const base = expr.expression
          if (ts.isPropertyAccessExpression(base) && base.expression && base.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isIdentifier(base.name) && varNames.includes(base.name.getText(sf))) {
            const root = expr.name && ts.isIdentifier(expr.name) ? expr.name.getText(sf) : null
            if (root) roots.push(root)
          }
        }
      }
      if (roots.length && node.name && ts.isIdentifier(node.name)) map.set(node.name.getText(sf), roots)
    }
    if (ts.isConstructorDeclaration(node) || ts.isMethodDeclaration(node)) {
      const body = node.body
      const statements = body ? body.statements : []
      for (const s of statements) {
        if (ts.isExpressionStatement(s) && ts.isBinaryExpression(s.expression)) {
          const be = s.expression
          if (be.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(be.left) && be.left.expression && be.left.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isObjectLiteralExpression(be.right)) {
            const spreads = be.right.properties.filter(p => ts.isSpreadAssignment(p)) as ts.SpreadAssignment[]
            const roots: string[] = []
            for (const sp of spreads) {
              const expr = sp.expression
              if (isServiceGetCall(sf, expr, serviceName)) {
                const arg = (expr as ts.CallExpression).arguments[0]
                if (arg && ts.isStringLiteral(arg)) roots.push(arg.text)
              } else if (ts.isPropertyAccessExpression(expr)) {
                const base = expr.expression
                if (ts.isPropertyAccessExpression(base) && base.expression && base.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isIdentifier(base.name) && varNames.includes(base.name.getText(sf))) {
                  const root = expr.name && ts.isIdentifier(expr.name) ? expr.name.getText(sf) : null
                  if (root) roots.push(root)
                }
              }
            }
            if (roots.length && ts.isIdentifier(be.left.name)) map.set(be.left.name.getText(sf), roots)
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return map
}

export function collectTemplateKeys(html: string, varNames: string[]): string[] {
  const keys = new Set<string>()
  for (const v of varNames) {
    const re = new RegExp(`${v}\\.([A-Za-z0-9_.]+)`, 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(html))) keys.add(m[1])
  }
  return Array.from(keys)
}

export function resolveKeyFromContext(pathStr: string, htmlKeys: string[]): string {
  if (pathStr.includes('.')) return pathStr
  const candidates = htmlKeys.filter(k => k.endsWith('.' + pathStr))
  if (candidates.length === 1) return candidates[0]
  const preferApp = candidates.find(k => k.startsWith('app.'))
  if (preferApp) return preferApp
  candidates.sort((a, b) => a.split('.').length - b.split('.').length)
  return candidates[0] || pathStr
}

export function flatten(obj: any, prefix = '', out: Record<string, any> = {}): Record<string, any> {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? prefix + '.' + k : k
    if (v && typeof v === 'object') flatten(v, key, out)
    else out[key] = v as any
  }
  return out
}

/**
 * 根据给定的路径字符串，在打包键集合中解析出最匹配的完整国际化键。
 * 1. 若 pathStr 已包含“.”，视为完整键，直接返回。
 * 2. 若 pathStr 本身存在于 packKeys，直接返回。
 * 3. 尝试在“app.”前缀下查找，若存在则返回。
 * 4. 收集所有以“.” + pathStr 结尾的键，若仅有一条，直接返回。
 * 5. 若有多条，优先选择以“app.”开头的键；否则返回最短路径。
 * 6. 若仍无匹配，原样返回 pathStr。
 * 
 * @param pathStr 待解析的短路径或完整路径
 * @param packKeys 已知的全部国际化键集合
 * @returns 解析后的完整国际化键
 */
export function resolveKey(pathStr: string, packKeys: Set<string>): string {
  if (pathStr.includes('.')) return pathStr
  if (packKeys.has(pathStr)) return pathStr
  const appKey = 'app.' + pathStr
  if (packKeys.has(appKey)) return appKey
  const candidates = Array.from(packKeys).filter(k => k.endsWith('.' + pathStr))
  if (candidates.length === 1) return candidates[0]
  const preferred = candidates.find(k => k.startsWith('app.'))
  if (preferred) return preferred
  return pathStr
}

type AliasInfo = { rootVar: string, path: string }

function isThisVarAccess(sf: ts.SourceFile, expr: ts.Expression): string | null {
  if (!ts.isPropertyAccessExpression(expr)) return null
  const base = expr.expression
  if (base && base.kind === ts.SyntaxKind.ThisKeyword && ts.isIdentifier(expr.name)) return expr.name.getText(sf)
  return null
}

type ChainSeg = { kind: 'prop', name: string } | { kind: 'elem', argText: string, literal?: string }

function extractAccessChain(sf: ts.SourceFile, expr: ts.Expression): { base: ts.Expression, segments: ChainSeg[] } {
  const segs: ChainSeg[] = []
  let cur: ts.Expression = expr
  let thisBase: ts.PropertyAccessExpression | null = null
  while (true) {
    if (ts.isPropertyAccessExpression(cur)) {
      segs.push({ kind: 'prop', name: cur.name.getText(sf) })
      if (cur.expression && cur.expression.kind === ts.SyntaxKind.ThisKeyword) thisBase = cur
      cur = cur.expression
      continue
    }
    if (ts.isElementAccessExpression(cur)) {
      const arg = cur.argumentExpression
      let literal: string | undefined
      let argText = arg.getText(sf)
      if (ts.isStringLiteral(arg)) literal = arg.text
      segs.push({ kind: 'elem', argText, literal })
      cur = cur.expression
      continue
    }
    break
  }
  if (thisBase) {
    // remove the locale var segment itself from the chain
    const idx = segs.findIndex(s => s.kind === 'prop' && (thisBase as ts.PropertyAccessExpression).name.getText(sf) === (s as any).name)
    if (idx !== -1) segs.splice(idx, 1)
  }
  return { base: thisBase || cur, segments: segs.reverse() }
}

function resolveInitAlias(sf: ts.SourceFile, expr: ts.Expression, serviceName: string, alias: Map<string, AliasInfo>): { rootVar: string | null, path: string | null } {
  if (ts.isIdentifier(expr)) {
    const info = alias.get(expr.getText(sf))
    if (info) return { rootVar: info.rootVar, path: info.path }
    return { rootVar: null, path: null }
  }
  if (ts.isPropertyAccessExpression(expr)) {
    const { base, segments } = extractAccessChain(sf, expr)
    const staticChain = segments.filter(s => s.kind === 'prop').map(s => (s as any).name).join('.')
    if (ts.isIdentifier(base)) {
      const info = alias.get(base.getText(sf))
      if (info) return { rootVar: info.rootVar, path: (info.path ? info.path + '.' : '') + staticChain }
      return { rootVar: null, path: null }
    }
    if (ts.isPropertyAccessExpression(base)) {
      const root = isThisVarAccess(sf, base)
      if (root && alias.has(root)) {
        const info = alias.get(root)!
        return { rootVar: info.rootVar, path: (info.path ? info.path + '.' : '') + staticChain }
      }
    }
    if (ts.isCallExpression(base) && isGetLocaleCall(sf, base, serviceName)) {
      return { rootVar: null, path: staticChain }
    }
    return { rootVar: null, path: null }
  }
  if (ts.isCallExpression(expr) && isGetLocaleCall(sf, expr, serviceName)) {
    return { rootVar: null, path: '' }
  }
  return { rootVar: null, path: null }
}

export function collectVarRefsRecursive(sf: ts.SourceFile, serviceName: string, varNames: string[]): Map<string, Set<string>> {
  const alias = new Map<string, AliasInfo>()
  for (const v of varNames) alias.set(v, { rootVar: v, path: '' })
  let changed = true
  while (changed) {
    changed = false
    function visit(node: ts.Node): void {
      if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) {
        const id = node.name.getText(sf)
        const { rootVar, path } = resolveInitAlias(sf, node.initializer, serviceName, alias)
        if (path !== null) {
          const rv = rootVar || id
          const prev = alias.get(id)
          const next: AliasInfo = { rootVar: rv, path: path }
          if (!prev || prev.path !== next.path || prev.rootVar !== next.rootVar) {
            alias.set(id, next)
            changed = true
          }
        }
      }
      if (ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression)) {
        const be = node.expression
        if (be.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(be.left) && be.left.expression && be.left.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isIdentifier(be.left.name)) {
          const id = be.left.name.getText(sf)
          const { rootVar, path } = resolveInitAlias(sf, be.right, serviceName, alias)
          if (path !== null) {
            const rv = varNames.includes(id) ? id : (rootVar || id)
            const prev = alias.get(id)
            const next: AliasInfo = { rootVar: rv, path: path }
            if (!prev || prev.path !== next.path || prev.rootVar !== next.rootVar) {
              alias.set(id, next)
              changed = true
            }
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  const refs = new Map<string, Set<string>>()
  for (const v of varNames) refs.set(v, new Set<string>())
  function collect(node: ts.Node): void {
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const { base, segments } = extractAccessChain(sf, node as ts.Expression)
      const parts: string[] = []
      for (const s of segments) {
        if (s.kind === 'prop') parts.push(s.name)
        else if (s.kind === 'elem') parts.push(s.literal ? s.literal : `[${s.argText}]`)
      }
      const fullChain = parts.join('.')
      if (ts.isIdentifier(base)) {
        const info = alias.get(base.getText(sf))
        if (info && refs.has(info.rootVar)) refs.get(info.rootVar)!.add((info.path ? info.path + '.' : '') + fullChain)
      } else if (ts.isPropertyAccessExpression(base)) {
        const root = isThisVarAccess(sf, base)
        if (root) {
          const info = alias.get(root)
          if (info && refs.has(info.rootVar)) refs.get(info.rootVar)!.add((info.path ? info.path + '.' : '') + fullChain)
        }
      }
    }
    ts.forEachChild(node, collect)
  }
  collect(sf)
  return refs
}

export type TsUsage = {
  filePath: string
  rootVar: string
  keyPath: string
  dynamicSegments?: string[]
  range: { start: number, end: number }
  loc: { line: number, column: number }
}

export function collectVarRefUsages(sf: ts.SourceFile, filePath: string, serviceName: string, varNames: string[]): TsUsage[] {
  const alias = new Map<string, AliasInfo>()
  for (const v of varNames) alias.set(v, { rootVar: v, path: '' })
  let changed = true
  while (changed) {
    changed = false
    function visit(node: ts.Node): void {
      if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) {
        const id = node.name.getText(sf)
        const { rootVar, path } = resolveInitAlias(sf, node.initializer, serviceName, alias)
        if (path !== null) {
          const rv = rootVar || id
          const prev = alias.get(id)
          const next: AliasInfo = { rootVar: rv, path: path }
          if (!prev || prev.path !== next.path || prev.rootVar !== next.rootVar) {
            alias.set(id, next)
            changed = true
          }
        }
      }
      if (ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression)) {
        const be = node.expression
        if (be.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(be.left) && be.left.expression && be.left.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isIdentifier(be.left.name)) {
          const id = be.left.name.getText(sf)
          const { rootVar, path } = resolveInitAlias(sf, be.right, serviceName, alias)
          if (path !== null) {
            const rv = varNames.includes(id) ? id : (rootVar || id)
            const prev = alias.get(id)
            const next: AliasInfo = { rootVar: rv, path: path }
            if (!prev || prev.path !== next.path || prev.rootVar !== next.rootVar) {
              alias.set(id, next)
              changed = true
            }
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  const out: TsUsage[] = []
  function collect(node: ts.Node): void {
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const { base, segments } = extractAccessChain(sf, node as ts.Expression)
      const parts: string[] = []
      const dyn: string[] = []
      for (const s of segments) {
        if (s.kind === 'prop') parts.push(s.name)
        else if (s.kind === 'elem') {
          if (s.literal) parts.push(s.literal)
          else dyn.push(s.argText)
        }
      }
      const appPath = parts.join('.')
      const start = node.getStart(sf)
      const end = node.getEnd()
      const lc = sf.getLineAndCharacterOfPosition(start)
      if (ts.isIdentifier(base)) {
        const info = alias.get(base.getText(sf))
        if (info) out.push({ filePath, rootVar: info.rootVar, keyPath: (info.path ? info.path + '.' : '') + appPath, dynamicSegments: dyn.length ? dyn : undefined, range: { start, end }, loc: { line: lc.line + 1, column: lc.character + 1 } })
      } else if (ts.isPropertyAccessExpression(base)) {
        const root = isThisVarAccess(sf, base)
        if (root) {
          const info = alias.get(root)
          if (info) out.push({ filePath, rootVar: info.rootVar, keyPath: (info.path ? info.path + '.' : '') + appPath, dynamicSegments: dyn.length ? dyn : undefined, range: { start, end }, loc: { line: lc.line + 1, column: lc.character + 1 } })
        }
      }
    }
    ts.forEachChild(node, collect)
  }
  collect(sf)
  return out
}

export type TemplateUsage = {
  filePath: string
  type: 'inline' | 'external'
  varName: string
  keyPath: string
  dynamicSegments?: string[]
  params?: Record<string, string>
  range?: { start: number, end: number }
  loc?: { line: number, column: number }
}

export function extractComponentTemplates(sf: ts.SourceFile, filePath: string): Array<{ type: 'inline' | 'external', html: string, node?: ts.StringLiteral, htmlPath?: string }> {
  const out: Array<{ type: 'inline' | 'external', html: string, node?: ts.StringLiteral, htmlPath?: string }> = []
  function visit(node: ts.Node): void {
    if (ts.canHaveDecorators(node)) {
      const decs = ts.getDecorators(node) || []
      for (const d of decs) {
        if (ts.isDecorator(d) && ts.isCallExpression(d.expression) && ts.isIdentifier(d.expression.expression) && d.expression.expression.text === 'Component') {
          const arg = d.expression.arguments[0]
          if (arg && ts.isObjectLiteralExpression(arg)) {
            for (const p of arg.properties) {
              if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) {
                const nm = p.name.text
                if (nm === 'template' && ts.isStringLiteral(p.initializer)) {
                  out.push({ type: 'inline', html: p.initializer.text, node: p.initializer })
                } else if (nm === 'templateUrl' && ts.isStringLiteral(p.initializer)) {
                  const tplPath = path.resolve(path.dirname(filePath), p.initializer.text)
                  let html = ''
                  try { html = fs.readFileSync(tplPath, 'utf8') } catch {}
                  out.push({ type: 'external', html, htmlPath: tplPath })
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
  return out
}

export function collectTemplateUsages(html: string, filePath: string, type: 'inline' | 'external', varNames: string[], baseOffset = 0): TemplateUsage[] {
  const out: TemplateUsage[] = []
  for (const v of varNames) {
    const re = new RegExp(`\\{\\{\\s*${v}\\.([A-Za-z0-9_.]+)`, 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(html))) {
      let key = m[1]
      if (key.includes('.replace')) key = key.split('.replace')[0]
      const params: Record<string, string> = {}
      const startInHtml = html.indexOf(`${v}.${key}`, m.index)
      const endInHtml = startInHtml + `${v}.${key}`.length
      const endExpr = html.indexOf('}}', endInHtml)
      const segment = html.slice(endInHtml, endExpr >= 0 ? endExpr : html.length)
      const reOne = /\.replace\(\s*(["'])\{([^}]+)\}\1\s*,\s*([^)]+)\s*\)/g
      let m2: RegExpExecArray | null
      while ((m2 = reOne.exec(segment))) params[m2[2]] = m2[3].trim()
      const dyn: string[] = []
      const reBracket = /\[\s*([^\]]+)\s*\]/g
      let m3: RegExpExecArray | null
      while ((m3 = reBracket.exec(segment))) {
        const t = m3[1].trim()
        const lit = t.match(/^['"]([^'\"]+)['"]$/)
        if (lit) key = key + '.' + lit[1]
        else dyn.push(t)
      }
      if (startInHtml >= 0) {
        const locLineCol = ((): { line: number, column: number } => {
          let line = 1, col = 1
          for (let i = 0; i < startInHtml; i++) {
            const ch = html.charCodeAt(i)
            if (ch === 10) { line++; col = 1 } else col++
          }
          return { line, column: col }
        })()
        out.push({ filePath, type, varName: v, keyPath: key, dynamicSegments: dyn.length ? dyn : undefined, params: Object.keys(params).length ? params : undefined, range: { start: baseOffset + startInHtml, end: baseOffset + endInHtml }, loc: locLineCol })
      } else {
        out.push({ filePath, type, varName: v, keyPath: key, dynamicSegments: dyn.length ? dyn : undefined, params: Object.keys(params).length ? params : undefined })
      }
    }
  }
  return out
}

export function collectAngularTemplateUsages(sf: ts.SourceFile, filePath: string, varNames: string[]): TemplateUsage[] {
  const templates = extractComponentTemplates(sf, filePath)
  const out: TemplateUsage[] = []
  for (const t of templates) {
    if (t.type === 'inline' && t.node) {
      const baseOffset = t.node.getStart(sf) + 1
      out.push(...collectTemplateUsages(t.html, filePath, 'inline', varNames, baseOffset))
    } else if (t.type === 'external') {
      const htmlPath = t.htmlPath || filePath
      out.push(...collectTemplateUsages(t.html, htmlPath, 'external', varNames, 0))
    }
  }
  return out
}

export function collectI18nUsageReport(sf: ts.SourceFile, filePath: string): { tsUsages: TsUsage[], templateUsages: TemplateUsage[] } {
  const serviceName = findServiceParamName(sf)
  const varNames = findLocaleVarNames(sf, serviceName)
  const tsUsages = collectVarRefUsages(sf, filePath, serviceName, varNames)
  const templateUsages = collectAngularTemplateUsages(sf, filePath, varNames)
  return { tsUsages, templateUsages }
}
