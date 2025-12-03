import ts from 'typescript' // 引入 TypeScript，用于 AST 解析与打印

export type KeyResolution = { keyExpr: string; params?: Record<string, string>; dynamicSegments?: string[] } // 键解析结果：键表达式、参数、动态段

export function resolveKeyFromAccess(sf: ts.SourceFile, node: ts.Expression, aliasPrefix: string | null, roots: string[]): KeyResolution { // 从访问表达式解析键
  const segs: Array<{ kind: 'prop'|'lit'|'dyn', text: string }> = [] // 收集的片段：属性/字面量/动态
  const printer = ts.createPrinter() // 创建打印器，用于还原表达式文本
  let cur: ts.Expression = node // 当前遍历节点
  while (true) { // 顺链回溯
    if (ts.isPropertyAccessExpression(cur)) { // 属性访问 a.b
      if (cur.expression.kind === ts.SyntaxKind.ThisKeyword) break // 到达 this.<alias> 停止
      const nm = (cur.name as ts.Identifier).text // 记录属性名
      segs.push({ kind: 'prop', text: nm }) // 存入片段
      cur = cur.expression // 上溯
      continue // 下一轮
    }
    if (ts.isElementAccessExpression(cur)) { // 索引访问 a['x'] 或 a[idx]
      const arg = cur.argumentExpression // 获取索引表达式
      if (ts.isStringLiteral(arg)) segs.push({ kind: 'lit', text: arg.text }) // 字面量索引
      else segs.push({ kind: 'dyn', text: printer.printNode(ts.EmitHint.Unspecified, arg, sf) }) // 动态索引表达式文本
      cur = cur.expression // 上溯
      continue // 继续捕获前置属性，遇到别名停止
    }
    break // 不是属性/索引访问则结束
  }
  segs.reverse() // 反转得到自左到右顺序
  const prefix = aliasPrefix && aliasPrefix.length ? aliasPrefix : (roots && roots.length ? roots[0] : '') // 前缀：别名路径或根
  const staticParts: string[] = [] // 静态片段集合
  const dynamics: string[] = [] // 动态片段集合
  let dynamicSeen = false // 是否遇到动态
  for (const s of segs) { // 收集直到动态为止
    if (s.kind === 'dyn') { dynamics.push(s.text); dynamicSeen = true; break } // 记录首个动态并停止
    staticParts.push(s.text) // 记录静态片段
  }
  const staticPath = [prefix, ...staticParts].filter(Boolean).join('.') // 拼静态路径
  let keyExpr = staticPath // 初始键表达式
  if (dynamicSeen) { // 有动态索引时，拼接成字符串加表达式
    const lastDyn = dynamics[0] // 首个动态片段
    keyExpr = `'${staticPath}.' + ${lastDyn}` // 静态 + '.' + 动态
  }
  if (!staticParts.length && !dynamicSeen) { // 只有别名本身：从原文本兜底解析
    const txt = node.getText(sf).replace(/^this\./, '') // 去掉 this.
    const remainder = txt.replace(/^[A-Za-z_]\w*\./, '') // 去掉别名
    if (/\[[^\]]+\]$/.test(remainder)) { // 末尾为索引访问
      const m = remainder.match(/^(.*)\[(['"])([^'\"]+)\2\]$/) // 字面量索引
      if (m) keyExpr = [prefix, m[1], m[3]].filter(Boolean).join('.') // 拼字面量索引
      else {
        const md = remainder.match(/^(.*)\[([^\]]+)\]$/) // 动态索引
        if (md) keyExpr = `'${[prefix, md[1]].filter(Boolean).join('.')}.' + ${md[2]}` // 拼动态索引
      }
    } else {
      keyExpr = [prefix, remainder].filter(Boolean).join('.') // 普通属性拼接
    }
  }
  return { keyExpr, dynamicSegments: dynamics.length ? dynamics : undefined } // 返回解析结果
}
