import ts from 'typescript' // 引入 TypeScript AST 与类型
import { config } from '../core/config'
import { collectVarAliases } from '../core/var-alias' // 导入别名收集工具
import { extractReplaceParams } from '../core/params-extractor' // 导入 replace 参数抽取器
import { renderTsGet } from '../replace/ts-replace' // 导入 TS 调用渲染器
import { pruneUnused } from '../replace/prune' // 导入无用声明清理器
import { pickRoot, getAllRoots, hasKey } from '../util/dict-reader'
import { resolveKeyFromAccess } from '../core/key-resolver'

function collectGetLocaleVars(code: string): string[] { // 收集通过 getLocale/getLocal 赋值的别名变量
  const names = new Set<string>() // 结果集合
  const reA = /this\.([A-Za-z_]\w*)\s*=\s*[^;]*\.getLocale\([^)]*\)/g // 匹配 getLocale 赋值
  const reB = /this\.([A-Za-z_]\w*)\s*=\s*[^;]*\.getLocal\([^)]*\)/g // 匹配 getLocal 赋值
  let m: RegExpExecArray | null // 临时匹配
  while ((m = reA.exec(code))) names.add(m[1]) // 记录变量名
  while ((m = reB.exec(code))) names.add(m[1]) // 记录变量名
  return Array.from(names) // 返回集合
}

type AliasInfo = { name: string; prefix: string | null; roots?: string[] } // 别名信息（名、前缀、合并来源）
function buildAliases(code: string): AliasInfo[] { // 从 TS 字符串中构建别名列表
  const sf = ts.createSourceFile('x.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS) // 解析源码
  
  // Detect service name from constructor
  let serviceName = ''
  const visitCtor = (node: ts.Node) => {
    if (ts.isConstructorDeclaration(node)) {
      for (const p of node.parameters) {
        if (p.type && ts.isTypeReferenceNode(p.type) && ts.isIdentifier(p.type.typeName) && p.type.typeName.text === config.serviceTypeName) {
           if (ts.isIdentifier(p.name)) serviceName = p.name.text
        }
      }
    }
    ts.forEachChild(node, visitCtor)
  }
  visitCtor(sf)

  const raw = collectVarAliases(sf, serviceName, config.getLocalMethod) // 通过 AST 收集别名
  const regexVars: string[] = []
  const out: AliasInfo[] = [] // 输出列表
  for (const a of raw) { // 转换结果结构
    out.push({ name: a.name, prefix: a.prefix, roots: a.roots }) // 推入别名
  }
  for (const name of regexVars) out.push({ name, prefix: null })
  // 不再将所有 this.<name>. 视为别名，避免误替换普通对象/数组方法
  // 去重：同名保留带前缀者
  const map = new Map<string, AliasInfo>() // 名称到别名映射
  for (const a of out) { // 遍历候选
    const prev = map.get(a.name) // 已有
    if (!prev || (a.prefix && !prev.prefix)) map.set(a.name, a) // 选择最佳
  }
  return Array.from(map.values()) // 返回列表
}

function filterLeafAliases(tsCode: string, aliases: AliasInfo[]): AliasInfo[] {
  const sf = ts.createSourceFile('x.ts', tsCode, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const usedAsAlias = new Set<string>()
  
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAccessExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isIdentifier(node.name)) {
        const name = node.name.text
        const p = node.parent
        if ((ts.isPropertyAccessExpression(p) && p.expression === node) ||
            (ts.isElementAccessExpression(p) && p.expression === node)) {
             usedAsAlias.add(name)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  const filtered = aliases.filter(a => usedAsAlias.has(a.name))
  const present = new Set(filtered.map(a => a.name))
  for (const name of Array.from(usedAsAlias)) {
    if (!present.has(name)) filtered.push({ name, prefix: null })
  }
  return filtered
}

function replaceTs(src: string): string { // 将 TS 中的对象访问统一替换为 this.<alias>.get(...)
  let s = src
  let aliases = buildAliases(src)
  const sfAst = ts.createSourceFile('x.ts', s, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  type Rep = { s: number; e: number; text: string }
  const reps: Rep[] = []
  const seen = new Set<string>()
  const info = new Map<string, AliasInfo>()
  for (const a of aliases) info.set(a.name, a)
  const printer = ts.createPrinter()
  const getAliasName = (expr: ts.Expression): string | null => {
    let cur: ts.Expression = expr
    while (ts.isPropertyAccessExpression(cur) || ts.isElementAccessExpression(cur)) {
      if (ts.isPropertyAccessExpression(cur) && cur.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isIdentifier(cur.name)) {
        return cur.name.text
      }
      cur = cur.expression as ts.Expression
    }
    return null
  }
  const visitAst = (node: ts.Node) => {
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      let outer: ts.Expression = node as ts.Expression
      while ((ts.isPropertyAccessExpression(outer.parent) && outer.parent.expression === outer) || (ts.isElementAccessExpression(outer.parent) && outer.parent.expression === outer)) {
        outer = outer.parent as ts.Expression
      }
      const aliasName = getAliasName(outer)
      if (aliasName && info.has(aliasName)) {
        const ai = info.get(aliasName)!
        const p = outer.parent
        const isCall = ts.isCallExpression(p) && p.expression === outer
        const isAssignLHS = ts.isBinaryExpression(p) && p.left === outer
        const isReplaceChain = ts.isPropertyAccessExpression(p) && p.name.getText(sfAst) === 'replace'
        if (!isCall && !isAssignLHS && !isReplaceChain) {
          const res = resolveKeyFromAccess(sfAst, outer as ts.Expression, ai.prefix || null, (ai.roots && ai.roots.length) ? ai.roots : getAllRoots())
          const text = renderTsGet(aliasName, res)
          const key = `${outer.getStart(sfAst)}:${outer.getEnd()}`
          if (!seen.has(key)) { reps.push({ s: outer.getStart(sfAst), e: outer.getEnd(), text }); seen.add(key) }
        }
      }
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.getText(sfAst) === 'get') {
      const base = node.expression.expression
      const aliasName = getAliasName(base)
      if (aliasName && info.has(aliasName)) {
        const ai = info.get(aliasName)!
        const arg0 = node.arguments[0]
        if (arg0 && ts.isStringLiteral(arg0)) {
           const roots = (ai.roots && ai.roots.length) ? ai.roots : getAllRoots()
           const r = pickRoot(roots, arg0.text)
           if (r) {
             const newKey = `${r}.${arg0.text}`
             const text = `this.${aliasName === 'i18n' ? 'i18n' : 'i18n'}.get('${newKey}')` // simplistic replacement, ignoring other args for now
             const key = `${node.getStart(sfAst)}:${node.getEnd()}`
             // check if we need to preserve other arguments? 
             // get(key, params) -> get(newKey, params)
             // simplified: only replace if key changes
             if (newKey !== arg0.text) {
               // We need to preserve other arguments if any.
               // But renderTsGet usually reconstructs the call.
               // Here we are editing an existing call.
               // Easier to just replace the string literal content?
               // But reps uses text replacement.
               // Let's replace the whole call to be safe/consistent.
               // Wait, renderTsGet generates `this.i18n.get(...)`.
               // Does it support preserving other args? 
               // resolveKeyFromAccess returns params? No, it returns params from access chain.
               // Here we have existing args.
               
               // Alternative: Just replace the string literal.
               const keySpan = { s: arg0.getStart(sfAst), e: arg0.getEnd() }
               const keyText = `'${newKey}'`
               const k = `${keySpan.s}:${keySpan.e}`
               if (!seen.has(k)) { 
                 reps.push({ s: keySpan.s, e: keySpan.e, text: keyText })
                 seen.add(k)
               }
             }
           }
        }
      }
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.getText(sfAst) === 'replace') {
      const calls: ts.CallExpression[] = []
      let cur: ts.Expression = node as ts.Expression
      while (ts.isCallExpression(cur) && ts.isPropertyAccessExpression(cur.expression) && cur.expression.name.getText(sfAst) === 'replace') {
        calls.unshift(cur)
        cur = cur.expression.expression
      }
      const base = cur
      const aliasName = getAliasName(base)
      if (aliasName && info.has(aliasName)) {
        const ai = info.get(aliasName)!
        const res = resolveKeyFromAccess(sfAst, base as ts.Expression, ai.prefix || null, (ai.roots && ai.roots.length) ? ai.roots : getAllRoots())
        const params: Record<string, string> = {}
        for (const c of calls) {
          const [a0, a1] = c.arguments
          if (a0 && ts.isStringLiteral(a0) && a1) {
            const m = a0.text.match(/^\{([^}]+)\}$/)
            const key = m ? m[1] : a0.text
            // 如果是字符串字面量，使用其文本内容（避免 printer 增加额外的引号）
            if (ts.isStringLiteral(a1)) {
              params[key] = `'${a1.text}'`
            } else {
              params[key] = printer.printNode(ts.EmitHint.Unspecified, a1, sfAst)
            }
          }
        }
        const text = renderTsGet(aliasName, { keyExpr: res.keyExpr, params })
        const key = `${(base as ts.Expression).getStart(sfAst)}:${(node as ts.Expression).getEnd()}`
        if (!seen.has(key)) { reps.push({ s: (base as ts.Expression).getStart(sfAst), e: (node as ts.Expression).getEnd(), text }); seen.add(key) }
      }
    }
    ts.forEachChild(node, visitAst)
  }
  visitAst(sfAst)
  if (reps.length) { reps.sort((a, b) => b.s - a.s); for (const r of reps) s = s.slice(0, r.s) + r.text + s.slice(r.e) }
  // Fallback: plain property chains not followed by call/replace/[ or assignment
  for (const a of aliases) {
    const name = a.name
    const composeKey = (path: string) => {
      if (a.prefix) return `${a.prefix}.${path}`
      const roots = (a.roots && a.roots.length) ? a.roots : getAllRoots()
      if (roots && roots.length) { const r = pickRoot(roots, path); return r ? `${r}.${path}` : path }
      return path
    }
    s = s.replace(new RegExp(`this\\.${name}\\.(?!get\\b)([A-Za-z0-9_.]+)(?!\\s*\\(|\\s*\\.replace|\\s*\\[|\\s*=)`, 'g'), (_m, path) => {
      const keyExpr = composeKey(String(path))
      return `this.${name === 'i18n' ? 'i18n' : 'i18n'}.get('${keyExpr}')`
    })
  }
  const sfCtor = ts.createSourceFile('x.ts', s, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  let serviceName = ''
  const visitCtor2 = (node: ts.Node) => {
    if (ts.isConstructorDeclaration(node)) {
      for (const p of node.parameters) {
        if (p.type && ts.isTypeReferenceNode(p.type) && ts.isIdentifier(p.type.typeName) && p.type.typeName.text === config.serviceTypeName) {
          if (ts.isIdentifier(p.name)) serviceName = p.name.text
        }
      }
    }
    ts.forEachChild(node, visitCtor2)
  }
  visitCtor2(sfCtor)
  if (serviceName) {
    s = s.replace(new RegExp(`this\\.([A-Za-z_]\\w*)\\s*=\\s*this\\.${serviceName}\\.(?:getLocale|getLocal)\\([^)]*\\)\\.([A-Za-z0-9_.]+)`, 'g'), (_m, v, path) => {
      const segs = String(path).split('.')
      const root = segs.shift() || ''
      const rest = segs.join('.')
      if (root && rest && hasKey(root, rest)) {
        return `this.${String(v)} = this.i18n.get('${root}.${rest}')`
      }
      return _m
    })
  }
  return s
}

function replaceHtml(src: string, aliases: AliasInfo[]): string { // 将模板插值统一替换为 i18n 管道
  let s = src // 工作副本
  const info = new Map<string, AliasInfo>() // 名称到别名信息
  for (const a of aliases) info.set(a.name, a) // 填充映射
  
  const getPrefix = (ai: AliasInfo, key: string) => {
    if (ai.prefix) return ai.prefix + '.'
    const roots = (ai.roots && ai.roots.length) ? ai.roots : getAllRoots()
    if (roots && roots.length) {
      const rp = pickRoot(roots, key)
      return rp ? rp + '.' : ''
    }
    return ''
  }

  s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)((?:\.replace\([^)]*\))+)[^}]*\}\}/g, (_m, v, key, chain) => { // 链式 replace
    const ai = info.get(String(v)) // 获取别名信息
    if (!ai) return _m // 未识别则原样返回
    const rootPrefix = getPrefix(ai, String(key)) // 根前缀
    const params = extractReplaceParams(chain) // 参数对象
    const keys = Object.keys(params)
    const p = keys.length ? `: {${keys.map(k => `${k}: ${params[k]}`).join(', ')}}` : '' // 管道参数文本
    return `{{ '${rootPrefix}${key}' | i18n${p} }}` // 渲染管道
  })
  s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)\s*\[(['"])([^'\"]+)\3\]\s*\}\}/g, (_m, v, base, _q, lit) => { // 索引字面量
    const ai = info.get(String(v)) // 别名信息
    if (!ai) return _m // 未识别返回
    const rootPrefix = getPrefix(ai, String(base)) // 根前缀
    return `{{ '${rootPrefix}${base}.${lit}' | i18n }}` // 渲染
  })
  s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)\s*\[([^\]]+)\]\s*\}\}/g, (_m, v, base, expr) => { // 动态索引
    const ai = info.get(String(v)) // 别名信息
    if (!ai) return _m // 未识别返回
    const rootPrefix = getPrefix(ai, String(base)) // 根前缀
    return `{{ ('${rootPrefix}${base}.' + ${expr.trim()}) | i18n }}` // 渲染
  })
  s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)\s*\}\}/g, (_m, v, key) => { // 普通属性链
    const ai = info.get(String(v)) // 别名信息
    if (!ai) return _m // 未识别返回
    const rootPrefix = getPrefix(ai, String(key)) // 根前缀
    return `{{ '${rootPrefix}${key}' | i18n }}` // 渲染
  })
  return s // 返回替换后的模板
}

function injectI18nPipe(code: string, filePath?: string): string {
  let s = code
  // 1. Find imports to determine path
  const match = s.match(/import\s*\{[^}]*I18nLocaleService[^}]*\}\s*from\s*['"]([^'"]+)['"]/)
  let pipePath = '../../i18n/i18n.pipe' // Default fallback
  if (match) {
    const servicePath = match[1] // e.g. './i18n' or '../../i18n'
    if (servicePath.endsWith('/i18n')) {
       pipePath = servicePath + '/i18n.pipe'
    }
  } else if (filePath) {
     // Try to guess based on depth?
     // 'app/app.component.ts' -> './i18n/i18n.pipe'
     // 'app/examples/x/x.ts' -> '../../i18n/i18n.pipe'
     // Just check if it contains 'examples'?
     if (!filePath.includes('examples/')) {
         pipePath = './i18n/i18n.pipe'
     }
  }
  
  // 2. Add import if not exists
  if (!s.includes('I18nPipe')) {
      // Insert after last import
      const lastImport = s.lastIndexOf('import ')
      if (lastImport >= 0) {
          const endOfImport = s.indexOf('\n', lastImport)
          if (endOfImport >= 0) {
              s = s.slice(0, endOfImport + 1) + `import { I18nPipe } from '${pipePath}';\n` + s.slice(endOfImport + 1)
          }
      }
  }

  // 3. Add to Component imports
  s = s.replace(/(imports\s*:\s*\[)([^\]]*)(\])/, (m, start, content, end) => {
      if (content.includes('I18nPipe')) return m
      const cleanContent = content.trim()
      const hasComma = cleanContent.endsWith(',')
      const separator = cleanContent.length > 0 ? (hasComma ? ' ' : ', ') : ''
      return `${start}${content}${separator}I18nPipe${end}`
  })
  return s
}

export function processComponent(tsCode: string, htmlCode: string, filePath?: string): { tsOut: string, htmlOut: string } { // 编排组件：TS 与 HTML 一致替换
  const rawAliases = buildAliases(tsCode) // 基于原始 TS 构建别名
  const aliasInfos = filterLeafAliases(tsCode, rawAliases)
  const varNames = rawAliases.map(a => a.name) // 收集所有别名变量名（包括未使用的，以便清理定义）
  let tsOut = replaceTs(tsCode) // 统一 TS 访问形态（在清理前以保留别名根信息）
  tsOut = pruneUnused({} as any, tsOut, varNames) // 清理无用赋值/声明
  // 统一别名 get 调用到 this.i18n.get(...)
  for (const ai of aliasInfos) { // 遍历别名
    if (ai.name !== 'i18n') { // 非 i18n 别名统一指向 this.i18n
      tsOut = tsOut.replace(new RegExp(`this\\.${ai.name}\\.get(?!Locale)\\s*\\(`, 'g'), 'this.i18n.get(') // 调用替换
    }
  }
  
  // 规范化构造函数注入 I18nService
  tsOut = tsOut.replace(/constructor\s*\(([^)]*)\)/, (m, params) => { // 重写构造签名
    let p = params // 参数文本
    const svc = config.serviceTypeName
    // 将任意名称、且类型为服务类型的参数统一改名为 i18n
    p = p.replace(new RegExp(`\\b(private|public|protected)?\\s*[A-Za-z_]\\w*\\s*:\\s*${svc}\\b`, 'g'), `public i18n: ${svc}`)
    return `constructor(${p})` // 返回构造函数头
  })
  
  tsOut = injectI18nPipe(tsOut, filePath) // 注入 I18nPipe
  
  // Cleanup blank lines
  tsOut = tsOut.replace(/(\r?\n){3,}/g, '\n\n')
  
  const htmlAliases = buildAliases(tsCode) // 基于原 TS 收集用于 HTML 的别名
  const htmlOut = replaceHtml(htmlCode, htmlAliases) // 替换模板
  return { tsOut, htmlOut } // 返回结果
}
