import ts from 'typescript'

export function pruneUnused(_sf: ts.SourceFile, code: string, varNames: string[]): string {
  // console.log('Pruning vars:', varNames)
  const file = ts.createSourceFile('x.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const del: Array<{ s: number; e: number }> = []
  const set = new Set(varNames)
  const hasGetLocaleCall = (node: ts.Node): boolean => {
    let hit = false
    const walk = (n: ts.Node) => {
      if (hit) return
      if (ts.isCallExpression(n)) {
        const ex = n.expression
        if (ts.isPropertyAccessExpression(ex)) {
          const nm = ex.name.getText(file)
          if (nm === 'getLocale' || nm === 'getLocal') { hit = true; return }
        }
      }
      ts.forEachChild(n, walk)
    }
    walk(node)
    return hit
  }
  const isAliasAccess = (node: ts.Node): boolean => {
    if (ts.isPropertyAccessExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ThisKeyword) return set.has(node.name.getText(file))
      return isAliasAccess(node.expression)
    }
    return false
  }
  const isAliasGetCall = (node: ts.Node): boolean => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      if (node.expression.name.text === 'get' &&
          ts.isPropertyAccessExpression(node.expression.expression) &&
          node.expression.expression.expression.kind === ts.SyntaxKind.ThisKeyword) {
        return set.has(node.expression.expression.name.getText(file))
      }
    }
    return false
  }
  const visit = (node: ts.Node) => {
    if (ts.isPropertyDeclaration(node)) {
      const id = ts.isIdentifier(node.name) ? node.name.text : ''
      if (id && set.has(id)) del.push({ s: node.getStart(file), e: node.getEnd() })
    }
    if (ts.isExpressionStatement(node)) {
      const be = node.expression
      if (ts.isBinaryExpression(be) && be.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const left = be.left
        if (ts.isPropertyAccessExpression(left) && left.expression.kind === ts.SyntaxKind.ThisKeyword) {
          const id = left.name.getText(file)
          if (set.has(id) && (hasGetLocaleCall(be.right) || isAliasAccess(be.right) || isAliasGetCall(be.right))) del.push({ s: node.getStart(file), e: node.getEnd() })
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  if (!del.length) return code
  del.sort((a, b) => a.s - b.s)
  let out = ''
  let last = 0
  for (const r of del) { out += code.slice(last, r.s); last = r.e }
  out += code.slice(last)
  return out
}
