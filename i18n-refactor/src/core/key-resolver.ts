import ts from 'typescript'
import { pickRoot } from '../util/dict-reader'

export type KeyResolution = { keyExpr: string; params?: Record<string, string>; dynamicSegments?: string[] }

/**
 * 从 TypeScript 源码中的访问表达式（如 obj.a.b 或 obj['key']）解析出国际化键（i18n key）。
 * @param sf - 当前源文件，用于打印节点文本
 * @param node - 起始访问表达式节点
 * @param aliasPrefix - 用户手动指定的前缀（可为空）
 * @param roots - 可选的根路径列表，用于自动挑选最匹配的前缀
 * @returns 解析结果，包含最终生成的 keyExpr 与动态片段数组
 */
export function resolveKeyFromAccess(sf: ts.SourceFile, node: ts.Expression, aliasPrefix: string | null, roots: string[]): KeyResolution {
  const segs: Array<{ kind: 'prop'|'lit'|'dyn', text: string }> = []
  const printer = ts.createPrinter()
  let cur: ts.Expression = node
  while (true) {
    if (ts.isPropertyAccessExpression(cur)) {
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
      continue
    }
    break
  }
  segs.reverse()
  const staticParts: string[] = []
  const dynamics: string[] = []
  let dynamicSeen = false
  for (const s of segs) {
    if (s.kind === 'dyn') { dynamics.push(s.text); dynamicSeen = true; break }
    staticParts.push(s.text)
  }
  let prefix = aliasPrefix && aliasPrefix.length ? aliasPrefix : ''
  if (!prefix && roots && roots.length) {
    const r = pickRoot(roots, staticParts.join('.'))
    if (r) prefix = r
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
    let basePath = remainder
    if (/\[[^\]]+\]$/.test(remainder)) {
      const m = remainder.match(/^(.*)\[(['"])([^'\"]+)\2\]$/)
      if (m) keyExpr = [prefix, m[1], m[3]].filter(Boolean).join('.')
      else {
        const md = remainder.match(/^(.*)\[([^\]]+)\]$/)
        if (md) keyExpr = `'${[prefix, md[1]].filter(Boolean).join('.')}.' + ${md[2]}`
      }
    } else {
      keyExpr = [prefix, basePath].filter(Boolean).join('.')
    }
  }
  return { keyExpr, dynamicSegments: dynamics.length ? dynamics : undefined }
}
