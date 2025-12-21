import ts from 'typescript'
import { config } from '../core/config'

export function pruneUnused(_sf: ts.SourceFile, code: string, varNames: string[]): { code: string; deleted: string[] } {
  // Pass 1: Collect aliases (properties/variables assigned from getLocale)
  const sf = ts.createSourceFile('x.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const aliases = new Set<string>(varNames)
  
  const isGetLocaleCall = (n: ts.Node): boolean => {
    let cur = n
    while (ts.isPropertyAccessExpression(cur) || ts.isElementAccessExpression(cur)) {
      cur = cur.expression
    }
    if (ts.isCallExpression(cur) && ts.isPropertyAccessExpression(cur.expression)) {
      const name = cur.expression.name.text
      return name === 'getLocale' || name === 'getLocal'
    }
    return false
  }

  const visitAnalyze = (node: ts.Node) => {
    // Check property initializers: class X { prop = this.i18n.getLocale() }
    if (ts.isPropertyDeclaration(node) && node.initializer && isGetLocaleCall(node.initializer)) {
      if (ts.isIdentifier(node.name)) aliases.add(node.name.text)
    }
    // Check assignments: this.prop = this.i18n.getLocale()
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      if (isGetLocaleCall(node.right)) {
        if (ts.isPropertyAccessExpression(node.left) && node.left.expression.kind === ts.SyntaxKind.ThisKeyword) {
          aliases.add(node.left.name.text)
        } else if (ts.isIdentifier(node.left)) {
           aliases.add(node.left.text)
        }
      }
    }
    // Check variable declarations: const x = this.i18n.getLocale()
    if (ts.isVariableDeclaration(node) && node.initializer && isGetLocaleCall(node.initializer)) {
       if (ts.isIdentifier(node.name)) aliases.add(node.name.text)
    }
    ts.forEachChild(node, visitAnalyze)
  }
  visitAnalyze(sf)

  // Pass 2: Collect deletion ranges
  const del: Array<{ s: number; e: number }> = []
  const deletedItems: string[] = []
  
  const visitDelete = (node: ts.Node) => {
    // Delete Property Declaration if in aliases
    if (ts.isPropertyDeclaration(node) && ts.isIdentifier(node.name)) {
      if (aliases.has(node.name.text)) {
        del.push({ s: node.getStart(sf), e: node.getEnd() })
        deletedItems.push(node.getText(sf).trim())
      }
    }
    // Delete Assignment Statement if LHS is alias and RHS is getLocale
    if (ts.isExpressionStatement(node)) {
      const expr = node.expression
      if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        if (isGetLocaleCall(expr.right)) {
           let name = ''
           if (ts.isPropertyAccessExpression(expr.left) && expr.left.expression.kind === ts.SyntaxKind.ThisKeyword) {
             name = expr.left.name.text
           } else if (ts.isIdentifier(expr.left)) {
             name = expr.left.text
           }
           if (name && aliases.has(name)) {
             del.push({ s: node.getStart(sf), e: node.getEnd() })
             deletedItems.push(node.getText(sf).trim())
           }
        }
      }
    }
    // Delete Variable Statement if declaration is alias and init is getLocale
    if (ts.isVariableStatement(node)) {
       let allRemovable = true
       const names: string[] = []
       for (const decl of node.declarationList.declarations) {
          if (!ts.isIdentifier(decl.name)) { allRemovable = false; break }
          if (!aliases.has(decl.name.text)) { allRemovable = false; break }
          if (!decl.initializer || !isGetLocaleCall(decl.initializer)) { allRemovable = false; break }
          names.push(decl.name.text)
       }
       if (allRemovable && node.declarationList.declarations.length > 0) {
         del.push({ s: node.getStart(sf), e: node.getEnd() })
         deletedItems.push(node.getText(sf).trim())
       }
    }
    
    ts.forEachChild(node, visitDelete)
  }
  visitDelete(sf)

  if (!del.length) return { code, deleted: [] }
  
  // Sort and merge ranges
  del.sort((a, b) => a.s - b.s)
  let out = ''
  let last = 0
  for (const r of del) {
    if (r.s < last) continue 
    out += code.slice(last, r.s)
    last = r.e
  }
  out += code.slice(last)
  
  return { code: out.replace(/^\s*[\r\n]/gm, ''), deleted: deletedItems }
}
