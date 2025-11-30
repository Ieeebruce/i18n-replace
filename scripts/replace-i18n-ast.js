// AST驱动的i18n替换脚本
// 主要能力：
// - 识别注入的 I18nLocaleService 参数名（默认使用 'locale'）
// - 识别组件中的词条根变量（getLocale() 返回值与合并变量）
// - 收集合并变量的根来源顺序（例如 ['home','app']），用于给单段键补前缀
// - 将 this.<var>.path 和链式 .replace(...) 转换为 this.<service>.get('<key>', params)
// - 同步模板插值为 i18n 管道形式，保留参数
// 运行结果写入 scripts/out/i18n-replace-ast.json 以便查看变更摘要
const fs = require('fs')
const path = require('path')
const ts = require('typescript')
const { createSourceFile } = require('./dist/utils/ast')
const { readFile, writeFile, walk, extractObject, tsObjectToJSON } = require('./lib/i18n-utils')
const {
  findServiceParamName: astFindServiceParamName,
  findLocaleVarNames: astFindLocaleVarNames,
  collectVarRootOrder: astCollectVarRootOrder,
  collectTemplateKeys: astCollectTemplateKeys,
  resolveKeyFromContext: astResolveKeyFromContext,
  i18nAstConfig
} = require('./dist/utils/ast')

// 通用替换工具：在执行正则替换的同时记录变更信息（偏移、前后文本、备注）
function applyRegexWithLog(s, re, replacer, changes, file, kind, note) {
  return s.replace(re, function(match) {
    const args = Array.prototype.slice.call(arguments)
    const offset = args[args.length - 2]
    const groups = args.slice(1, args.length - 2)
    const after = replacer.apply(null, [match].concat(groups))
    changes.push({ kind, file, offset, before: match, after, note })
    return after
  })
}

// 解析命令行参数：支持 --dir=<目录名> 或直接传目录名，默认 'src'
function parseArgs() {
  const args = process.argv.slice(2)
  let srcDirName = 'src'
  for (const a of args) {
    const m = a.match(/^--dir=(.+)$/)
    if (m) srcDirName = m[1]
    else if (!a.startsWith('--')) srcDirName = a
  }
  for (const a of args) {
    const m1 = a.match(/^--serviceTypeName=(.+)$/)
    if (m1) i18nAstConfig.serviceTypeName = m1[1]
    const m2 = a.match(/^--getLocaleMethod=(.+)$/)
    if (m2) i18nAstConfig.getLocaleMethod = m2[1]
    const m3 = a.match(/^--getMethod=(.+)$/)
    if (m3) i18nAstConfig.getMethod = m3[1]
    const m4 = a.match(/^--fallbackServiceParamName=(.+)$/)
    if (m4) i18nAstConfig.fallbackServiceParamName = m4[1]
  }
  return { srcDirName }
}

// 在构造函数参数中查找注入的 I18nLocaleService 的参数名
// 未找到时回退为 'locale'
function findServiceParamName(sf) {
  const source = sf
  let out = null
  function visit(node) {
    if (ts.isConstructorDeclaration(node)) {
      for (const p of node.parameters) {
        if (p.type && ts.isTypeReferenceNode(p.type) && p.type.typeName && p.type.typeName.getText(sf) === 'I18nLocaleService') {
          const nm = p.name.getText(sf)
          out = nm
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return out || 'locale'
}

// 收集组件内的“词条根变量”名称
// 覆盖以下模式：
// - 类属性初始化：this.<service>.getLocale()
// - 合并变量：对象字面量包含 ...this.<service>.get('<root>') 或 ...this.<localeVar>.<root>
// - 方法返回 getLocale()（函数型 getter）
// - 构造函数赋值中的上述两类
// 若未发现任何变量，回退为 'T'（模板别名常见）
function findLocaleVarNames(sf, serviceName) {
  const out = new Set()
  const localeVars = new Set()
  // 识别 this.<service>.getLocale() 调用
  function isGetLocaleCall(expr) {
    if (!expr || !ts.isCallExpression(expr)) return false
    const ex = expr.expression
    return ts.isPropertyAccessExpression(ex) && ex.name.getText(sf) === 'getLocale' && ts.isPropertyAccessExpression(ex.expression) && ex.expression.expression && ex.expression.expression.kind === ts.SyntaxKind.ThisKeyword && ex.expression.name.getText(sf) === serviceName
  }
  // 识别 this.<service>.get('<root>') 调用
  function isServiceGetCall(expr) {
    if (!expr || !ts.isCallExpression(expr)) return false
    const ex = expr.expression
    return ts.isPropertyAccessExpression(ex) && ex.name.getText(sf) === 'get' && ts.isPropertyAccessExpression(ex.expression) && ex.expression.expression && ex.expression.expression.kind === ts.SyntaxKind.ThisKeyword && ex.expression.name.getText(sf) === serviceName
  }
  // 识别 this.<localeVar>.<root> 作为合并来源（localeVar 来自 getLocale()）
  function isVarRootAccess(expr) {
    if (!expr || !ts.isPropertyAccessExpression(expr)) return false
    const base = expr.expression
    return ts.isPropertyAccessExpression(base) && base.expression && base.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isIdentifier(base.name) && localeVars.has(base.name.getText(sf))
  }
  // AST 访问：覆盖属性、方法、构造函数三处常见赋值/初始化模式
  function visit(node) {
    if (ts.isPropertyDeclaration(node) && node.initializer && isGetLocaleCall(node.initializer)) {
      if (node.name && ts.isIdentifier(node.name)) {
        out.add(node.name.getText(sf))
        localeVars.add(node.name.getText(sf))
      }
    }
    if (ts.isPropertyDeclaration(node) && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      const spreads = node.initializer.properties.filter(p => ts.isSpreadAssignment(p))
      const hasServiceGet = spreads.some(sp => isServiceGetCall(sp.expression))
      const hasVarRootAccess = spreads.some(sp => isVarRootAccess(sp.expression))
      if (hasServiceGet || hasVarRootAccess) {
        if (node.name && ts.isIdentifier(node.name)) out.add(node.name.getText(sf))
      }
    }
    if (ts.isMethodDeclaration(node) && node.body && node.name && ts.isIdentifier(node.name)) {
      const ret = node.body.statements.find(s => ts.isReturnStatement(s))
      if (ret && ret.expression && isGetLocaleCall(ret.expression)) out.add(node.name.getText(sf))
    }
    if (ts.isConstructorDeclaration(node)) {
      for (const s of node.body ? node.body.statements : []) {
        if (ts.isExpressionStatement(s) && ts.isBinaryExpression(s.expression)) {
          const be = s.expression
          if (be.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(be.left) && be.left.expression && be.left.expression.kind === ts.SyntaxKind.ThisKeyword && isGetLocaleCall(be.right)) {
            if (ts.isIdentifier(be.left.name)) {
              out.add(be.left.name.getText(sf))
              localeVars.add(be.left.name.getText(sf))
            }
          }
          if (be.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(be.left) && be.left.expression && be.left.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isObjectLiteralExpression(be.right)) {
            const spreads2 = be.right.properties.filter(p => ts.isSpreadAssignment(p))
            const hasServiceGet2 = spreads2.some(sp => isServiceGetCall(sp.expression))
            const hasVarRootAccess2 = spreads2.some(sp => isVarRootAccess(sp.expression))
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

// 收集合并变量的根来源顺序（出现顺序即优先级）
// 既识别 this.<service>.get('<root>')，也识别 this.<localeVar>.<root>
function collectVarRootOrder(sf, serviceName, varNames) {
  const map = new Map()
  // 识别服务 get 调用
  function isServiceGetCall(expr) {
    if (!expr || !ts.isCallExpression(expr)) return false
    const ex = expr.expression
    return ts.isPropertyAccessExpression(ex) && ex.name.getText(sf) === 'get' && ts.isPropertyAccessExpression(ex.expression) && ex.expression.expression && ex.expression.expression.kind === ts.SyntaxKind.ThisKeyword && ex.expression.name.getText(sf) === serviceName
  }
  // 识别来自 getLocale() 的变量根访问形式
  function isVarRootAccess(expr) {
    if (!expr || !ts.isPropertyAccessExpression(expr)) return false
    const base = expr.expression
    return ts.isPropertyAccessExpression(base) && base.expression && base.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isIdentifier(base.name) && varNames.includes(base.name.getText(sf))
  }
  // 访问属性初始化与构造/方法体中的对象合并，按 SpreadAssignment 顺序收集根
  function visit(node) {
    if (ts.isPropertyDeclaration(node) && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      const spreads = node.initializer.properties.filter(p => ts.isSpreadAssignment(p))
      const roots = []
      for (const sp of spreads) {
        const expr = sp.expression
        if (isServiceGetCall(expr)) {
          const arg = expr.arguments[0]
          if (arg && ts.isStringLiteral(arg)) roots.push(arg.text)
        } else if (isVarRootAccess(expr)) {
          const root = expr.name && ts.isIdentifier(expr.name) ? expr.name.getText(sf) : null
          if (root) roots.push(root)
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
            const spreads = be.right.properties.filter(p => ts.isSpreadAssignment(p))
            const roots = []
            for (const sp of spreads) {
              const expr = sp.expression
              if (isServiceGetCall(expr)) {
                const arg = expr.arguments[0]
                if (arg && ts.isStringLiteral(arg)) roots.push(arg.text)
              } else if (isVarRootAccess(expr)) {
                const root = expr.name && ts.isIdentifier(expr.name) ? expr.name.getText(sf) : null
                if (root) roots.push(root)
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

// 从模板中收集 {{ var.path }} 的候选完整键，用于回退策略（只在无法由根顺序决定时）
function collectTemplateKeys(html, varNames) {
  const keys = new Set()
  for (const v of varNames) {
    const re = new RegExp(`\\{\\{\\s*${v}\\.([A-Za-z0-9_.]+)`, 'g')
    let m
    while ((m = re.exec(html))) keys.add(m[1])
  }
  return Array.from(keys)
}

// 单段 path 的上下文回退：
// - 唯一的后缀匹配优先
// - 含 app. 的候选优先
// - 其余按层级深度排序取最短
function resolveKeyFromContext(pathStr, htmlKeys) {
  if (pathStr.includes('.')) return pathStr
  const candidates = htmlKeys.filter(k => k.endsWith('.' + pathStr))
  if (candidates.length === 1) return candidates[0]
  const preferApp = candidates.find(k => k.startsWith('app.'))
  if (preferApp) return preferApp
  candidates.sort((a, b) => a.split('.').length - b.split('.').length)
  return candidates[0] || pathStr
}

// 替换 TS 内容：
// - this.<var>.path.replace(...) → this.<service>.get('<key>', { ...params })
// - this.<var>.path → this.<service>.get('<key>')
// 键构造规则：已含点直接使用；否则优先 varRootOrder 的首根，再回退模板上下文
// 并确保 I18nPipe 已导入且加入 @Component.imports
function replaceTsContent(content, serviceName, varNames, componentDir, srcRootDir, changes, filePath, htmlKeys, varRootOrder) {
  let s = content
  const varsToProcess = Array.from(new Set([].concat(varNames, ['i18n'])))
  for (const v of varsToProcess) {
    if (v === serviceName) continue
    // 链式模板替换匹配：收集所有 .replace('{k}', expr) 参数为对象注入
    const reChain = new RegExp(`this\\.${v}(?![A-Za-z0-9_])\\.([\\w.]+)((?:\\.replace\\([^)]*\\))+)`, 'g')
    s = applyRegexWithLog(s, reChain, (m, pathStr, chainText) => {
      if (v === serviceName) return m
      const reOne = /\.replace\(\s*["']\{([^}]+)\}["']\s*,\s*([^)]+)\s*\)/g
      const params = []
      let mg
      while ((mg = reOne.exec(chainText))) params.push(`${mg[1]}: ${mg[2]}`)
      let key = pathStr.includes('.') ? pathStr : null
      if (!key) {
        const roots = varRootOrder.get(v) || []
        if (roots.length) key = `${roots[0]}.${pathStr}`
      }
      if (!key) key = astResolveKeyFromContext(pathStr, htmlKeys || [])
      const target = `this.${serviceName}`
      return `${target}.get('${key}', { ${params.join(', ')} })`
    }, changes, filePath, 'ts', 'chain-replace-to-service.get')
    // 简单属性访问匹配：无 .replace 链的场景
    const reSimple = new RegExp(`this\\.${v}(?![A-Za-z0-9_])\\.([\\w]+(?:\\.[\\w]+)+)(?!\\()`, 'g')
    s = applyRegexWithLog(s, reSimple, (m, pathStr) => {
      if (v === serviceName) return m
      let key = pathStr.includes('.') ? pathStr : null
      if (!key) {
        const roots = varRootOrder.get(v) || []
        if (roots.length) key = `${roots[0]}.${pathStr}`
      }
      if (!key) key = astResolveKeyFromContext(pathStr, htmlKeys || [])
      const target = `this.${serviceName}`
      return `${target}.get('${key}')`
    }, changes, filePath, 'ts', 'property-to-service.get')

    // 动态索引访问：this.<var>.<path>[expr]
    const reIndex = new RegExp(`this\\.${v}(?![A-Za-z0-9_])\\.([\\w.]+)\\s*\\[([^\\]]+)\\]`, 'g')
    s = applyRegexWithLog(s, reIndex, (m, pathStr, idxExpr) => {
      if (v === serviceName) return m
      let base = pathStr.includes('.') ? pathStr : null
      if (!base) {
        const roots = varRootOrder.get(v) || []
        if (roots.length) base = `${roots[0]}.${pathStr}`
      }
      if (!base) base = astResolveKeyFromContext(pathStr, htmlKeys || [])
      const target = `this.${serviceName}`
      const lit = idxExpr.match(/^\s*['"]([^'\"]+)['"]\s*$/)
      if (lit) return `${target}.get('${base}.${lit[1]}')`
      return `${target}.get('${base}.' + ${idxExpr.trim()})`
    }, changes, filePath, 'ts', 'index-access-to-service.get')

    // 将别名上的 get 调用统一到服务
    const reAliasGet = new RegExp(`this\\.${v}(?![A-Za-z0-9_])\\.get\\(([^)]*)\\)`, 'g')
    s = applyRegexWithLog(s, reAliasGet, (m, args) => {
      if (v === serviceName) return m
      return `this.${serviceName}.get(${args})`
    }, changes, filePath, 'ts', 'alias-get-to-service.get')
  }
  // 清理因部分匹配导致的残留：将 get(x)t('key') 合并为 get('key')
  s = applyRegexWithLog(s, new RegExp(`this\\.${serviceName}\\.get\\(([^)]*)\\)\\s*t\\(\\s*(["'][^"']+["'])\\s*\\)`, 'g'), (m, _a, b) => `this.${serviceName}.get(${b})`, changes, filePath, 'ts', 'cleanup partial get + t')
  const typeName = i18nAstConfig.serviceTypeName || 'I18nLocaleService'
  s = applyRegexWithLog(s, new RegExp(`\\b(private|protected)\\s+${serviceName}\\s*:\\s*${typeName}\\b`, 'g'), () => `public ${serviceName}: ${typeName}` , changes, filePath, 'ts', 'service param to public')
  return s
}

function removeUnusedLocaleVars(content, serviceName, varNames, filePath, changes) {
  const sf = createSourceFile(filePath, content)
  const used = new Set()
  const decls = []
  const assigns = []
  function isGetLocaleCallExpr(expr) {
    if (!expr || !ts.isCallExpression(expr)) return false
    const ex = expr.expression
    return ts.isPropertyAccessExpression(ex) && ex.name.getText(sf) === 'getLocale' && ts.isPropertyAccessExpression(ex.expression) && ex.expression.expression && ex.expression.expression.kind === ts.SyntaxKind.ThisKeyword && ex.expression.name.getText(sf) === serviceName
  }
  function isLocaleMerge(expr) {
    if (!expr || !ts.isObjectLiteralExpression(expr)) return false
    const spreads = expr.properties.filter(p => ts.isSpreadAssignment(p))
    return spreads.some(sp => {
      const e = sp.expression
      if (ts.isPropertyAccessExpression(e) && e.expression && e.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isIdentifier(e.name) && varNames.includes(e.name.getText(sf))) return true
      if (ts.isCallExpression(e)) return isGetLocaleCallExpr(e)
      return false
    })
  }
  function visit(node) {
    if (ts.isPropertyAccessExpression(node) && node.expression && node.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isIdentifier(node.name)) {
      const nm = node.name.getText(sf)
      const p = node.parent
      const isAssignLHS = p && ts.isBinaryExpression(p) && p.left === node && p.operatorToken && p.operatorToken.kind === ts.SyntaxKind.EqualsToken
      if (varNames.includes(nm) && !isAssignLHS) used.add(nm)
    }
    if (ts.isElementAccessExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.expression && node.expression.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isIdentifier(node.expression.name)) {
      const nm = node.expression.name.getText(sf)
      if (varNames.includes(nm)) used.add(nm)
    }
    if (ts.isPropertyDeclaration(node) && ts.isIdentifier(node.name) && varNames.includes(node.name.getText(sf))) {
      decls.push({ start: node.getStart(sf), end: node.getEnd() })
    }
    if (ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression)) {
      const be = node.expression
      if (be.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(be.left) && be.left.expression && be.left.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isIdentifier(be.left.name) && varNames.includes(be.left.name.getText(sf)) && isGetLocaleCallExpr(be.right)) {
        assigns.push({ start: node.getStart(sf), end: node.getEnd() })
      }
      if (be.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(be.left) && be.left.expression && be.left.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isIdentifier(be.left.name) && varNames.includes(be.left.name.getText(sf)) && isLocaleMerge(be.right)) {
        assigns.push({ start: node.getStart(sf), end: node.getEnd() })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  const unused = varNames.filter(v => !used.has(v))
  if (unused.length === 0) return content
  const ranges = []
  for (const r of decls) ranges.push(r)
  for (const r of assigns) ranges.push(r)
  // 若 AST 未能命中具体片段，仍继续执行后续的规则性清理
  ranges.sort((a, b) => b.start - a.start)
  let s = content
  for (const r of ranges) {
    const before = s.slice(r.start, r.end)
    changes.push({ kind: 'ts', file: filePath, offset: r.start, before, after: '', note: 'remove unused locale var' })
    s = s.slice(0, r.start) + s.slice(r.end)
  }
  // 额外回退：若仍存在未过滤的声明或赋值，进行规则性清理
  for (const v of unused) {
    const hasUsage = new RegExp(`this\\.${v}(?![A-Za-z0-9_])\\.|this\\.${v}\\s*\\[`).test(s)
    if (hasUsage) continue
    const rePropTyped = new RegExp(`(^|\n)\s*${v}\s*:\s*[^;]+;\s*`, 'm')
    const rePropBare = new RegExp(`(^|\n)\s*${v}\s*;\s*`, 'm')
    const reAssignAny = new RegExp(`(^|\n)\s*this\.${v}\s*=\s*[^;]+;\s*`, 'm')
    s = s.replace(rePropTyped, (m) => { changes.push({ kind: 'ts', file: filePath, offset: s.indexOf(m), before: m, after: '', note: 'remove unused locale var (typed)' }); return '' })
    s = s.replace(rePropBare, (m) => { changes.push({ kind: 'ts', file: filePath, offset: s.indexOf(m), before: m, after: '', note: 'remove unused locale var (bare)' }); return '' })
    s = s.replace(reAssignAny, (m) => { changes.push({ kind: 'ts', file: filePath, offset: s.indexOf(m), before: m, after: '', note: 'remove unused locale var (assign)' }); return '' })
  }
  return s
}

// 替换模板插值：将 {{ var.path }} 转换为 {{ 'path' | i18n }}
// 链式模板参数同样收集后注入管道参数对象
function replaceHtmlContent(html, varNames, varRootOrder, htmlKeys) {
  let out = html
  for (const v of varNames) {
    const reChain = new RegExp(`\{\{\s*${v}\.([\ -\uFFFF]*?)\}\}`, 'g')
    out = out.replace(reChain, (m) => m)
    const reTplChain = new RegExp(`\{\{\s*${v}\.([\\w.]+)((?:\\.replace\\(\\s*'\\{([^}]+)\\}'\\s*,\\s*[^)]+\\s*\\)\\s*)+)\s*\}\}`, 'g')
    out = out.replace(reTplChain, (m, pathStr, chainText) => {
      const reOne = /\.replace\(\s*["']\{([^}]+)\}["']\s*,\s*([^)]+)\s*\)/g
      const params = []
      let mg
      while ((mg = reOne.exec(chainText))) params.push(`${mg[1]}: ${mg[2]}`)
      let key = pathStr.includes('.') ? pathStr : null
      if (!key) {
        const roots = varRootOrder.get(v) || []
        if (roots.length) key = `${roots[0]}.${pathStr}`
      }
      if (!key) key = astResolveKeyFromContext(pathStr, htmlKeys || [])
      return `{{ '${key}' | i18n: { ${params.join(', ')} } }}`
    })
    const reIndex = new RegExp(`\\{\\{\\s*${v}\\.([A-Za-z0-9_.]+)\\s*\\[([^\\]]+)\\]\\s*\\}\\}`, 'g')
    out = out.replace(reIndex, (m, pathStr, idxExpr) => {
      let base = pathStr.includes('.') ? pathStr : null
      if (!base) {
        const roots = varRootOrder.get(v) || []
        if (roots.length) base = `${roots[0]}.${pathStr}`
      }
      if (!base) base = astResolveKeyFromContext(pathStr, htmlKeys || [])
      const lit = idxExpr.match(/^\s*['"]([^'\"]+)['"]\s*$/)
      if (lit) return `{{ '${base}.${lit[1]}' | i18n }}`
      return `{{ ('${base}.' + ${idxExpr.trim()}) | i18n }}`
    })
    const reSimple = new RegExp(`\{\{\s*${v}\.([\\w.]+)\\s*\}\}`, 'g')
    out = out.replace(reSimple, (m, pathStr) => {
      let key = pathStr.includes('.') ? pathStr : null
      if (!key) {
        const roots = varRootOrder.get(v) || []
        if (roots.length) key = `${roots[0]}.${pathStr}`
      }
      if (!key) key = astResolveKeyFromContext(pathStr, htmlKeys || [])
      return `{{ '${key}' | i18n }}`
    })
  }
  return out
}

function replaceHtmlContentUsingService(html, serviceName, varNames, varRootOrder, htmlKeys) {
  let out = html
  for (const v of varNames) {
    const reChain = new RegExp(`\\{\\{\\s*${v}\\.([\\u0000-\\uFFFF]*?)\\}\\}`, 'g')
    out = out.replace(reChain, (m) => m)
    const reTplChain = new RegExp(`\\{\\{\\s*${v}\\.([\\w.]+)((?:\\.replace\\(\\s*'\\{([^}]+)\\}'\\s*,\\s*[^)]+\\s*\\)\\s*)+)\\s*\\}\\}`, 'g')
    out = out.replace(reTplChain, (m, pathStr, chainText) => {
      const reOne = /\\.replace\\(\\s*[\"']\\{([^}]+)\\}[\"']\\s*,\\s*([^)]+)\\s*\\)/g
      const params = []
      let mg
      while ((mg = reOne.exec(chainText))) params.push(`${mg[1]}: ${mg[2]}`)
      let key = pathStr.includes('.') ? pathStr : null
      if (!key) {
        const roots = varRootOrder.get(v) || []
        if (roots.length) key = `${roots[0]}.${pathStr}`
      }
      if (!key) key = astResolveKeyFromContext(pathStr, htmlKeys || [])
      return `{{ ${serviceName}.get('${key}', { ${params.join(', ')} }) }}`
    })
    const reIndex = new RegExp(`\\{\\{\\s*${v}\\.([A-Za-z0-9_.]+)\\s*\\[([^\\]]+)\\]\\s*\\}\\}`, 'g')
    out = out.replace(reIndex, (m, pathStr, idxExpr) => {
      let base = pathStr.includes('.') ? pathStr : null
      if (!base) {
        const roots = varRootOrder.get(v) || []
        if (roots.length) base = `${roots[0]}.${pathStr}`
      }
      if (!base) base = astResolveKeyFromContext(pathStr, htmlKeys || [])
      const lit = idxExpr.match(/^\\s*['\"]([^'\"]+)['\"]\\s*$/)
      if (lit) return `{{ ${serviceName}.get('${base}.${lit[1]}') }}`
      return `{{ ${serviceName}.get('${base}.' + ${idxExpr.trim()}) }}`
    })
    const reSimple = new RegExp(`\\{\\{\\s*${v}\\.([\\w.]+)\\s*\\}\\}`, 'g')
    out = out.replace(reSimple, (m, pathStr) => {
      let key = pathStr.includes('.') ? pathStr : null
      if (!key) {
        const roots = varRootOrder.get(v) || []
        if (roots.length) key = `${roots[0]}.${pathStr}`
      }
      if (!key) key = astResolveKeyFromContext(pathStr, htmlKeys || [])
      return `{{ ${serviceName}.get('${key}') }}`
    })
  }
  return out
}

// 处理单个组件：解析 TS → 识别服务名/变量/根顺序 → 替换 TS → 替换模板
// 同时记录所有替换项，便于输出报告
function processComponent(tsPath, srcDir) {
  const content = readFile(tsPath)
  if (!/@Component\(/.test(content)) return
  const sf = ts.createSourceFile(tsPath, content, { languageVersion: ts.ScriptTarget.Latest, scriptKind: ts.ScriptKind.TS })
  const serviceName = astFindServiceParamName(sf)
  let varNames = astFindLocaleVarNames(sf, serviceName)
  varNames = varNames.filter(v => v !== serviceName)
  const dir = path.dirname(tsPath)
  const changesTs = []
  const m = content.match(/templateUrl\s*:\s*['"]([^'"]+)['"]/)
  let htmlKeys = []
  let changedTs = content
  const varRootOrder = astCollectVarRootOrder(sf, serviceName, varNames)
  if (m) {
    const htmlPath = path.join(dir, m[1])
    if (fs.existsSync(htmlPath)) {
      const htmlOld = readFile(htmlPath)
      htmlKeys = astCollectTemplateKeys(htmlOld, varNames)
    }
  }
  changedTs = replaceTsContent(content, serviceName, varNames, dir, srcDir, changesTs, tsPath, htmlKeys, varRootOrder)
  let changedTs2 = removeUnusedLocaleVars(changedTs, serviceName, Array.from(new Set(varNames.concat(['i18n']))), tsPath, changesTs)
  if (changedTs2 !== changedTs) {
    changedTs = changedTs2
    const changedTs3 = removeUnusedLocaleVars(changedTs, serviceName, Array.from(new Set(varNames.concat(['i18n']))), tsPath, changesTs)
    if (changedTs3 !== changedTs) changedTs = changedTs3
  }
  if (changedTs !== content) writeFile(tsPath, changedTs)
  if (m) {
    const htmlPath = path.join(dir, m[1])
    if (fs.existsSync(htmlPath)) {
      const htmlOld = readFile(htmlPath)
      const roots = new Set(varNames)
      roots.add('i18n')
      const htmlNew = replaceHtmlContent(htmlOld, Array.from(roots), varRootOrder, htmlKeys)
      let next = htmlNew
      const changesHtml = []
      if (next === htmlOld) {
        for (const v of Array.from(roots)) {
          next = applyRegexWithLog(next, new RegExp(`\{\{\\s*${v}\\.([A-Za-z0-9_.]+)\\s*\}\}`, 'g'), (m, p1) => {
            let key = p1.includes('.') ? p1 : null
            if (!key) {
              const roots = varRootOrder.get(v) || []
              if (roots.length) key = `${roots[0]}.${p1}`
            }
            if (!key) key = astResolveKeyFromContext(p1, htmlKeys || [])
            return `{{ '${key}' | i18n }}`
          }, changesHtml, htmlPath, 'html', 'fallback template to pipe')
          next = applyRegexWithLog(next, new RegExp('\\{\\{\\s*' + v + '\\.([A-Za-z0-9_.]+)((?:\\.replace\\([^)]*\\))+)\\s*\\}\\}', 'g'), (m, p1, p2) => {
            const reOne = /\.replace\(\s*["']\{([^}]+)\}["']\s*,\s*([^)]+)\s*\)/g
            const params = []
            let mg
            while ((mg = reOne.exec(p2))) params.push(`${mg[1]}: ${mg[2]}`)
            let key = p1.includes('.') ? p1 : null
            if (!key) {
              const roots = varRootOrder.get(v) || []
              if (roots.length) key = `${roots[0]}.${p1}`
            }
            if (!key) key = astResolveKeyFromContext(p1, htmlKeys || [])
            return `{{ '${key}' | i18n: { ${params.join(', ')} } }}`
          }, changesHtml, htmlPath, 'html', 'fallback template chain to pipe')
          next = applyRegexWithLog(next, new RegExp('\\{\\{\\s*' + v + '\\.([A-Za-z0-9_.]+)\\s*\\[([^\\]]+)\\]\\s*\\}\\}', 'g'), (m, p1, idxExpr) => {
            let base = p1.includes('.') ? p1 : null
            if (!base) {
              const roots = varRootOrder.get(v) || []
              if (roots.length) base = `${roots[0]}.${p1}`
            }
            if (!base) base = astResolveKeyFromContext(p1, htmlKeys || [])
            const lit = idxExpr.match(/^\s*['"]([^'\"]+)['"]\s*$/)
            if (lit) return `{{ '${base}.${lit[1]}' | i18n }}`
            return `{{ ('${base}.' + ${idxExpr.trim()}) | i18n }}`
          }, changesHtml, htmlPath, 'html', 'fallback template index to pipe')
        }
      }
      if (next !== htmlOld) writeFile(htmlPath, next)
      return { tsChanges: changesTs, htmlChanges: changesHtml, htmlPath, meta: { serviceName, varNames } }
    }
  }
  return { tsChanges: changesTs, htmlChanges: [], htmlPath: null, meta: { serviceName, varNames } }
}

// 主流程：遍历目标目录下所有 TS 文件，逐个组件处理，并输出变更报告 JSON
function main() {
  const { srcDirName } = parseArgs()
  const srcDir = path.join(process.cwd(), srcDirName)
  const files = walk(srcDir, p => p.endsWith('.ts'))
  const results = []
  for (const f of files) {
    const beforeTs = readFile(f)
    const changes = processComponent(f, srcDir) || { tsChanges: [], htmlChanges: [], htmlPath: null }
    const afterTs = readFile(f)
    const changed = beforeTs !== afterTs
    const entry = { file: path.relative(process.cwd(), f), changed }
    if (changed) entry.changes = changes.tsChanges
    if (changes.meta) entry.meta = changes.meta
    results.push(entry)
    if (changes.htmlPath) {
      const relHtml = path.relative(process.cwd(), changes.htmlPath)
      const htmlChanged = changes.htmlChanges && changes.htmlChanges.length > 0
      const htmlEntry = { file: relHtml, changed: htmlChanged }
      if (htmlChanged) htmlEntry.changes = changes.htmlChanges
      if (changes.meta) htmlEntry.meta = changes.meta
      results.push(htmlEntry)
    }
  }
  const changedCount = results.filter(r => r.changed).length
  const outDir = path.join(process.cwd(), 'scripts', 'out')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const json = JSON.stringify({ changed: changedCount, results }, null, 2) + '\n'
  fs.writeFileSync(path.join(outDir, 'i18n-replace-ast.json'), json, 'utf8')
  process.stdout.write(json)
}

main()
// 将嵌套对象扁平化为点号键集合，辅助词包匹配
function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? prefix + '.' + k : k
    if (v && typeof v === 'object') flatten(v, key, out)
    else out[key] = v
  }
  return out
}

// 加载 zh.ts 词包并生成扁平键集合，供键解析备用
function loadPackKeys(srcRootDir) {
  try {
    const zhTs = path.join(srcRootDir, 'app', 'i18n', 'zh.ts')
    const text = extractObject(readFile(zhTs), 'zh')
    const obj = JSON.parse(tsObjectToJSON(text))
    return new Set(Object.keys(flatten(obj)))
  } catch {
    return new Set()
  }
}

// 基于词包解析键（备用）：优先已有完整键或 app.<path>，再尝试后缀匹配
function resolveKey(pathStr, packKeys) {
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
