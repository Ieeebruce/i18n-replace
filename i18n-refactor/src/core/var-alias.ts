import ts from 'typescript' // 引入 TypeScript AST 工具

export type VarAlias = { name: string; prefix: string | null; roots: string[]; declNode?: ts.Node } // 变量别名信息：名称、前缀、根来源、定义节点
export type ExternalAliasMap = Map<string, VarAlias[]> // 外部类型别名映射：类名 -> 别名列表

function isGetLocalCall(sf: ts.SourceFile, expr: ts.Expression, serviceParamName: string, getLocalMethod: string): boolean { // 是否为 this.<service>.getLocal(...) 调用
  if (!expr || !ts.isCallExpression(expr)) return false // 不是调用表达式
  const ex = expr.expression // 调用目标
  return ts.isPropertyAccessExpression(ex) // 形如 a.b
    && ex.name.getText(sf) === getLocalMethod // 方法名为 getLocal
    && ts.isPropertyAccessExpression(ex.expression) // 前缀为 this.<service>
    && ex.expression.expression.kind === ts.SyntaxKind.ThisKeyword // 以 this 开始
    && ts.isIdentifier(ex.expression.name) // 服务名为标识符
    && ex.expression.name.getText(sf) === serviceParamName // 服务名匹配
}

function chainAfterGetLocal(sf: ts.SourceFile, expr: ts.Expression): string[] { // 提取 getLocal 调用后的属性链
  const segs: string[] = [] // 存储段
  let cur: ts.Expression = expr // 当前表达式
  while (ts.isPropertyAccessExpression(cur)) { // 连续属性访问
    segs.push(cur.name.getText(sf)) // 记录属性名
    cur = cur.expression // 上溯
  }
  return segs.reverse() // 返回自左到右顺序
}

export function collectVarAliases(sf: ts.SourceFile, serviceParamName: string, getLocalMethod: string, externalAliases?: ExternalAliasMap): VarAlias[] { // 收集别名：前缀与根来源
  // console.log('collectVarAliases start', serviceParamName, getLocalMethod)
  const out = new Map<string, VarAlias>() // 存储结果映射
  function addAlias(name: string, declNode?: ts.Node): VarAlias { // 获取或创建别名记录
    // console.log('addAlias', name)
    if (!out.has(name)) out.set(name, { name, prefix: null, roots: [], declNode }) // 初始化
    const a = out.get(name)!
    if (declNode && !a.declNode) a.declNode = declNode
    return a // 返回记录
  }
  function visit(node: ts.Node) { // AST 访问
    if (ts.isPropertyDeclaration(node) && node.initializer) {
      if (ts.isPropertyAccessExpression(node.initializer)) { // 属性初始化为访问表达式
        const base = node.initializer // 基本表达式
        let cur: ts.Expression = base // 当前表达式
        while (ts.isPropertyAccessExpression(cur)) cur = cur.expression // 上溯到调用
        if (ts.isCallExpression(cur) && isGetLocalCall(sf, cur, serviceParamName, getLocalMethod)) { // 是 getLocal 调用
          const segs = chainAfterGetLocal(sf, base) // 提取链
          if (node.name && ts.isIdentifier(node.name)) { // 属性名标识符
            const a = addAlias(node.name.getText(sf), node) // 别名记录
            a.prefix = segs.join('.') // 设置前缀
          }
        }
      } else if (ts.isCallExpression(node.initializer) && isGetLocalCall(sf, node.initializer, serviceParamName, getLocalMethod)) {
        if (node.name && ts.isIdentifier(node.name)) {
          const a = addAlias(node.name.getText(sf), node)
          if (node.initializer.arguments.length > 0) {
             const arg = node.initializer.arguments[0]
             if (ts.isStringLiteral(arg)) {
               a.prefix = arg.text
             }
          }
        }
      }
    }
    if (ts.isPropertyDeclaration(node) && node.initializer && ts.isObjectLiteralExpression(node.initializer) && node.name && ts.isIdentifier(node.name)) { // 属性初始化为对象字面量
      const spreads = node.initializer.properties.filter(p => ts.isSpreadAssignment(p)) as ts.SpreadAssignment[] // 收集展开项
      const roots: string[] = [] // 根来源集合
      for (const sp of spreads) { // 遍历展开
        const e = sp.expression // 展开表达式
        if (ts.isPropertyAccessExpression(e)) { // 属性访问
          let cur: ts.Expression = e // 当前
          while (ts.isPropertyAccessExpression(cur)) cur = cur.expression // 上溯
          if (ts.isCallExpression(cur) && isGetLocalCall(sf, cur, serviceParamName, getLocalMethod)) { // getLocal 来源
            const segs = chainAfterGetLocal(sf, e) // 取链
            if (segs.length) roots.push(segs[0]) // 记录根段
          }
        }
      }
      if (roots.length) { // 有根来源
        const a = addAlias(node.name.getText(sf), node) // 别名记录
        a.roots = roots // 设置根顺序
      }
    }
    if (ts.isConstructorDeclaration(node)) { // 构造函数赋值
      const paramTypes = new Map<string, string>()
      for (const p of node.parameters) {
        if (ts.isIdentifier(p.name) && p.type && ts.isTypeReferenceNode(p.type) && ts.isIdentifier(p.type.typeName)) {
           paramTypes.set(p.name.text, p.type.typeName.text)
        }
      }
      for (const s of node.body ? node.body.statements : []) { // 遍历语句
        if (ts.isExpressionStatement(s) && ts.isBinaryExpression(s.expression)) { // 赋值表达式
          const be = s.expression // 二元表达式
          if (be.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(be.left)) { // 左侧为属性访问
            const left = be.left // 左侧表达式
            if (left.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isIdentifier(left.name)) { // this.<name>
              const nm = left.name.getText(sf) // 名称
              if (ts.isPropertyAccessExpression(be.right)) { // 右侧为属性访问链
                const base = be.right // 右侧表达式
                let cur: ts.Expression = base // 当前
                while (ts.isPropertyAccessExpression(cur)) cur = cur.expression // 上溯
                if (ts.isCallExpression(cur) && isGetLocalCall(sf, cur, serviceParamName, getLocalMethod)) { // getLocal 调用
                  const segs = chainAfterGetLocal(sf, base) // 链
                  const a = addAlias(nm, be) // 别名记录
                  a.prefix = segs.join('.') // 设置前缀
                } else {
                  let temp: ts.Expression = base
                  while (ts.isPropertyAccessExpression(temp)) {
                    if (temp.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isIdentifier(temp.name)) {
                      const otherName = temp.name.getText(sf)
                      if (out.has(otherName)) {
                        const other = out.get(otherName)!
                        const segs = chainAfterGetLocal(sf, base)
                        if (segs.length && segs[0] === otherName) segs.shift()
                        const a = addAlias(nm, be)
                        if (other.prefix) a.prefix = [other.prefix, ...segs].join('.')
                        else a.prefix = segs.join('.')
                        if (other.roots) a.roots = other.roots
                        break
                      } else if (externalAliases && paramTypes.has(otherName)) {
                        const typeName = paramTypes.get(otherName)!
                        console.log('[DEBUG] Checking external alias', otherName, typeName)
                        const exList = externalAliases.get(typeName)
                        if (exList) {
                            console.log('[DEBUG] Found external aliases for', typeName, exList)
                            const path: string[] = []
                            let curr: ts.Expression = base
                            let valid = true
                            while (curr !== temp) {
                               if (ts.isPropertyAccessExpression(curr)) {
                                 path.unshift(curr.name.getText(sf))
                                 curr = curr.expression
                              } else {
                                 valid = false; break
                              }
                           }
                           if (valid && path.length > 0) {
                              const aliasProp = path[0]
                              const target = exList.find(x => x.name === aliasProp)
                              if (target) {
                                 console.log('[DEBUG] Match external alias', aliasProp, 'to', target)
                                 path.shift()
                                 const a = addAlias(nm, be)
                                 if (target.prefix) a.prefix = [target.prefix, ...path].join('.')
                                 else a.prefix = path.join('.')
                                 if (target.roots) a.roots = target.roots
                                 break
                              }
                           }
                        }
                      }
                    }
                    temp = temp.expression
                  }
                }
              } else if (ts.isCallExpression(be.right) && isGetLocalCall(sf, be.right, serviceParamName, getLocalMethod)) {
                const a = addAlias(nm)
                if (be.right.arguments.length > 0) {
                   const arg = be.right.arguments[0]
                   if (ts.isStringLiteral(arg)) {
                     a.prefix = arg.text
                   }
                }
              }
              if (ts.isObjectLiteralExpression(be.right)) { // 右侧为对象字面量（合并）
                const spreads = be.right.properties.filter(p => ts.isSpreadAssignment(p)) as ts.SpreadAssignment[] // 展开项
                const roots: string[] = [] // 根来源集合
                for (const sp of spreads) { // 遍历展开
                  const e = sp.expression // 表达式
                  if (ts.isPropertyAccessExpression(e)) { // 属性访问
                    let cur: ts.Expression = e // 当前
                    while (ts.isPropertyAccessExpression(cur)) cur = cur.expression // 上溯
                    if (ts.isCallExpression(cur) && isGetLocalCall(sf, cur, serviceParamName, getLocalMethod)) { // 来源判断
                      const segs = chainAfterGetLocal(sf, e) // 链
                      if (segs.length) roots.push(segs[0]) // 记录根段
                    }
                  }
                }
                if (roots.length) { // 有根来源
                  const a = addAlias(nm) // 别名记录
                  a.roots = roots // 设置根顺序
                }
              }
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit) // 递归子节点
  }
  visit(sf) // 开始遍历
  return Array.from(out.values()) // 返回别名列表
}
