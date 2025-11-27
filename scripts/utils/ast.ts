import * as ts from 'typescript'

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
    const re = new RegExp(`\\{\\{\\s*${v}\\.([A-Za-z0-9_.]+)`, 'g')
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
