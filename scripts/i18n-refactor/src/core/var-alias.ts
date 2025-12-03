import ts from 'typescript'

export type VarAlias = { name: string; prefix: string | null; roots: string[] }

function isGetLocalCall(sf: ts.SourceFile, expr: ts.Expression, serviceParamName: string, getLocalMethod: string): boolean {
  if (!expr || !ts.isCallExpression(expr)) return false
  const ex = expr.expression
  return ts.isPropertyAccessExpression(ex)
    && ex.name.getText(sf) === getLocalMethod
    && ts.isPropertyAccessExpression(ex.expression)
    && ex.expression.expression.kind === ts.SyntaxKind.ThisKeyword
    && ts.isIdentifier(ex.expression.name)
    && ex.expression.name.getText(sf) === serviceParamName
}

function chainAfterGetLocal(sf: ts.SourceFile, expr: ts.Expression): string[] {
  const segs: string[] = []
  let cur: ts.Expression = expr
  while (ts.isPropertyAccessExpression(cur)) {
    segs.push(cur.name.getText(sf))
    cur = cur.expression
  }
  return segs.reverse()
}

export function collectVarAliases(sf: ts.SourceFile, serviceParamName: string, getLocalMethod: string): VarAlias[] {
  const out = new Map<string, VarAlias>()
  function addAlias(name: string): VarAlias {
    if (!out.has(name)) out.set(name, { name, prefix: null, roots: [] })
    return out.get(name)!
  }
  function visit(node: ts.Node) {
    // property initializer alias
    if (ts.isPropertyDeclaration(node) && node.initializer && ts.isPropertyAccessExpression(node.initializer)) {
      const base = node.initializer
      let cur: ts.Expression = base
      while (ts.isPropertyAccessExpression(cur)) cur = cur.expression
      if (ts.isCallExpression(cur) && isGetLocalCall(sf, cur, serviceParamName, getLocalMethod)) {
        const segs = chainAfterGetLocal(sf, base)
        if (node.name && ts.isIdentifier(node.name)) {
          const a = addAlias(node.name.getText(sf))
          a.prefix = segs.join('.')
        }
      }
    }
    // property initializer object literal spreads
    if (ts.isPropertyDeclaration(node) && node.initializer && ts.isObjectLiteralExpression(node.initializer) && node.name && ts.isIdentifier(node.name)) {
      const spreads = node.initializer.properties.filter(p => ts.isSpreadAssignment(p)) as ts.SpreadAssignment[]
      const roots: string[] = []
      for (const sp of spreads) {
        const e = sp.expression
        if (ts.isPropertyAccessExpression(e)) {
          let cur: ts.Expression = e
          while (ts.isPropertyAccessExpression(cur)) cur = cur.expression
          if (ts.isCallExpression(cur) && isGetLocalCall(sf, cur, serviceParamName, getLocalMethod)) {
            const segs = chainAfterGetLocal(sf, e)
            if (segs.length) roots.push(segs[0])
          }
        }
      }
      if (roots.length) {
        const a = addAlias(node.name.getText(sf))
        a.roots = roots
      }
    }
    // constructor assignments
    if (ts.isConstructorDeclaration(node)) {
      for (const s of node.body ? node.body.statements : []) {
        if (ts.isExpressionStatement(s) && ts.isBinaryExpression(s.expression)) {
          const be = s.expression
          if (be.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(be.left)) {
            const left = be.left
            if (left.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isIdentifier(left.name)) {
              const nm = left.name.getText(sf)
              if (ts.isPropertyAccessExpression(be.right)) {
                const base = be.right
                let cur: ts.Expression = base
                while (ts.isPropertyAccessExpression(cur)) cur = cur.expression
                if (ts.isCallExpression(cur) && isGetLocalCall(sf, cur, serviceParamName, getLocalMethod)) {
                  const segs = chainAfterGetLocal(sf, base)
                  const a = addAlias(nm)
                  a.prefix = segs.join('.')
                }
              }
              if (ts.isObjectLiteralExpression(be.right)) {
                const spreads = be.right.properties.filter(p => ts.isSpreadAssignment(p)) as ts.SpreadAssignment[]
                const roots: string[] = []
                for (const sp of spreads) {
                  const e = sp.expression
                  if (ts.isPropertyAccessExpression(e)) {
                    let cur: ts.Expression = e
                    while (ts.isPropertyAccessExpression(cur)) cur = cur.expression
                    if (ts.isCallExpression(cur) && isGetLocalCall(sf, cur, serviceParamName, getLocalMethod)) {
                      const segs = chainAfterGetLocal(sf, e)
                      if (segs.length) roots.push(segs[0])
                    }
                  }
                }
                if (roots.length) {
                  const a = addAlias(nm)
                  a.roots = roots
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
  return Array.from(out.values())
}
