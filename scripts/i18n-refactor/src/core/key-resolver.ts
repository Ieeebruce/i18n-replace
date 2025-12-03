import ts from 'typescript'

export type KeyResolution = { keyExpr: string; params?: Record<string, string>; dynamicSegments?: string[] }

export function resolveKeyFromAccess(sf: ts.SourceFile, node: ts.Expression, aliasPrefix: string | null, roots: string[]): KeyResolution {
  const segs: Array<{ kind: 'prop'|'lit'|'dyn', text: string }> = []
  const printer = ts.createPrinter()
  let cur: ts.Expression = node
  while (true) {
    if (ts.isPropertyAccessExpression(cur)) {
      // stop at alias: this.<alias>
      if (cur.expression.kind === ts.SyntaxKind.ThisKeyword) break
      const nm = (cur.name as ts.Identifier).text
      segs.push({ kind: 'prop', text: nm })
      cur = cur.expression
      continue
    }
    if (ts.isElementAccessExpression(cur)) {
      const arg = cur.argumentExpression
      if (ts.isStringLiteral(arg)) segs.push({ kind: 'lit', text: arg.text })
      else segs.push({ kind: 'dyn', text: printer.printNode(ts.EmitHint.Unspecified, arg, sf) })
      cur = cur.expression
      // allow next loop to capture preceding property, but will stop at alias
      continue
    }
    break
  }
  segs.reverse()
  const prefix = aliasPrefix && aliasPrefix.length ? aliasPrefix : (roots && roots.length ? roots[0] : '')
  const staticParts: string[] = []
  const dynamics: string[] = []
  let dynamicSeen = false
  for (const s of segs) {
    if (s.kind === 'dyn') { dynamics.push(s.text); dynamicSeen = true; break }
    staticParts.push(s.text)
  }
  const staticPath = [prefix, ...staticParts].filter(Boolean).join('.')
  let keyExpr = staticPath
  if (dynamicSeen) {
    const lastDyn = dynamics[0]
    keyExpr = `'${staticPath}.' + ${lastDyn}`
  }
  if (!staticParts.length && !dynamicSeen) {
    const txt = node.getText(sf).replace(/^this\./, '')
    const remainder = txt.replace(/^[A-Za-z_]\w*\./, '')
    if (/\[[^\]]+\]$/.test(remainder)) {
      const m = remainder.match(/^(.*)\[(['"])([^'\"]+)\2\]$/)
      if (m) keyExpr = [prefix, m[1], m[3]].filter(Boolean).join('.')
      else {
        const md = remainder.match(/^(.*)\[([^\]]+)\]$/)
        if (md) keyExpr = `'${[prefix, md[1]].filter(Boolean).join('.')}.' + ${md[2]}`
      }
    } else {
      keyExpr = [prefix, remainder].filter(Boolean).join('.')
    }
  }
  return { keyExpr, dynamicSegments: dynamics.length ? dynamics : undefined }
}
