const fs = require('fs')
const path = require('path')
const ts = require('typescript')
const { readFile, writeFile, walk, extractObject, tsObjectToJSON } = require('./lib/i18n-utils')

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

function parseArgs() {
  const args = process.argv.slice(2)
  let srcDirName = 'src'
  for (const a of args) {
    const m = a.match(/^--dir=(.+)$/)
    if (m) srcDirName = m[1]
    else if (!a.startsWith('--')) srcDirName = a
  }
  return { srcDirName }
}

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

function findLocaleVarNames(sf, serviceName) {
  const out = new Set()
  function isGetLocaleCall(expr) {
    if (!expr || !ts.isCallExpression(expr)) return false
    const ex = expr.expression
    return ts.isPropertyAccessExpression(ex) && ex.name.getText(sf) === 'getLocale' && ts.isPropertyAccessExpression(ex.expression) && ex.expression.expression && ex.expression.expression.kind === ts.SyntaxKind.ThisKeyword && ex.expression.name.getText(sf) === serviceName
  }
  function isServiceGetCall(expr) {
    if (!expr || !ts.isCallExpression(expr)) return false
    const ex = expr.expression
    return ts.isPropertyAccessExpression(ex) && ex.name.getText(sf) === 'get' && ts.isPropertyAccessExpression(ex.expression) && ex.expression.expression && ex.expression.expression.kind === ts.SyntaxKind.ThisKeyword && ex.expression.name.getText(sf) === serviceName
  }
  function visit(node) {
    if (ts.isPropertyDeclaration(node) && node.initializer && isGetLocaleCall(node.initializer)) {
      if (node.name && ts.isIdentifier(node.name)) out.add(node.name.getText(sf))
    }
    if (ts.isPropertyDeclaration(node) && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      const spreads = node.initializer.properties.filter(p => ts.isSpreadAssignment(p))
      if (spreads.some(sp => isServiceGetCall(sp.expression))) {
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
            if (ts.isIdentifier(be.left.name)) out.add(be.left.name.getText(sf))
          }
          if (be.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(be.left) && be.left.expression && be.left.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isObjectLiteralExpression(be.right)) {
            const spreads2 = be.right.properties.filter(p => ts.isSpreadAssignment(p))
            if (spreads2.some(sp => isServiceGetCall(sp.expression))) {
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
  return Array.from(out)
}

function collectVarRootOrder(sf, serviceName) {
  const map = new Map()
  function isServiceGetCall(expr) {
    if (!expr || !ts.isCallExpression(expr)) return false
    const ex = expr.expression
    return ts.isPropertyAccessExpression(ex) && ex.name.getText(sf) === 'get' && ts.isPropertyAccessExpression(ex.expression) && ex.expression.expression && ex.expression.expression.kind === ts.SyntaxKind.ThisKeyword && ex.expression.name.getText(sf) === serviceName
  }
  function visit(node) {
    if (ts.isPropertyDeclaration(node) && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      const spreads = node.initializer.properties.filter(p => ts.isSpreadAssignment(p))
      const roots = []
      for (const sp of spreads) {
        const expr = sp.expression
        if (isServiceGetCall(expr)) {
          const arg = expr.arguments[0]
          if (arg && ts.isStringLiteral(arg)) roots.push(arg.text)
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

function collectTemplateKeys(html, varNames) {
  const keys = new Set()
  for (const v of varNames) {
    const re = new RegExp(`\\{\\{\\s*${v}\\.([A-Za-z0-9_.]+)`, 'g')
    let m
    while ((m = re.exec(html))) keys.add(m[1])
  }
  return Array.from(keys)
}

function resolveKeyFromContext(pathStr, htmlKeys) {
  if (pathStr.includes('.')) return pathStr
  const candidates = htmlKeys.filter(k => k.endsWith('.' + pathStr))
  if (candidates.length === 1) return candidates[0]
  const preferApp = candidates.find(k => k.startsWith('app.'))
  if (preferApp) return preferApp
  candidates.sort((a, b) => a.split('.').length - b.split('.').length)
  return candidates[0] || pathStr
}

function replaceTsContent(content, serviceName, varNames, componentDir, srcRootDir, changes, filePath, htmlKeys, varRootOrder) {
  let s = content
  for (const v of varNames) {
    const reChain = new RegExp(`this\\.${v}\\.([\\w.]+)((?:\\.replace\\(\\s*'\\{([^}]+)\\}'\\s*,\\s*([^)]+)\\s*\\)\\s*)+)`, 'g')
    s = applyRegexWithLog(s, reChain, (m, pathStr, chainText) => {
      const reOne = /\\.replace\\(\\s*'\\{([^}]+)\\}'\\s*,\\s*([^)]+)\\s*\\)/g
      const params = []
      let mg
      while ((mg = reOne.exec(chainText))) params.push(`${mg[1]}: ${mg[2]}`)
      let key = pathStr.includes('.') ? pathStr : null
      if (!key) {
        const roots = varRootOrder.get(v) || []
        if (roots.length) key = `${roots[0]}.${pathStr}`
      }
      if (!key) key = resolveKeyFromContext(pathStr, htmlKeys || [])
      return `this.${serviceName}.get('${key}', { ${params.join(', ')} })`
    }, changes, filePath, 'ts', 'chain-replace-to-service.get')
    const reSimple = new RegExp(`this\\.${v}\\.([\\w.]+)`, 'g')
    s = applyRegexWithLog(s, reSimple, (m, pathStr) => {
      let key = pathStr.includes('.') ? pathStr : null
      if (!key) {
        const roots = varRootOrder.get(v) || []
        if (roots.length) key = `${roots[0]}.${pathStr}`
      }
      if (!key) key = resolveKeyFromContext(pathStr, htmlKeys || [])
      return `this.${serviceName}.get('${key}')`
    }, changes, filePath, 'ts', 'property-to-service.get')
  }
  const relDir = path.relative(componentDir, path.join(srcRootDir, 'app', 'i18n')).replace(/\\\\/g, '/')
  const pipeImport = `import { I18nPipe } from '${relDir ? relDir : '.'}/i18n.pipe'`
  if (!new RegExp(`import\\s*\\{\\s*I18nPipe\\s*\\}`).test(s)) {
    changes.push({ kind: 'ts', file: filePath, offset: 0, before: '', after: pipeImport + '\n', note: 'add I18nPipe import' })
    s = pipeImport + '\n' + s
  }
  s = applyRegexWithLog(s, /@Component\(\{([\s\S]*?)\}\)/m, (m, obj) => {
    if (/imports\s*:\s*\[[^\]]*I18nPipe/.test(obj)) return m
    if (/imports\s*:\s*\[[^\]]*\]/.test(obj)) return m.replace(/imports\s*:\s*\[([^\]]*)\]/, (mm, arr) => `imports: [${arr}, I18nPipe]`)
    return m.replace(/\{/, '{ imports: [I18nPipe],')
  }, changes, filePath, 'ts', 'ensure I18nPipe in @Component imports')
  return s
}

function replaceHtmlContent(html, varNames) {
  let out = html
  for (const v of varNames) {
    const reChain = new RegExp(`\{\{\s*${v}\.([\ -\uFFFF]*?)\}\}`, 'g')
    out = out.replace(reChain, (m) => m)
    const reTplChain = new RegExp(`\{\{\s*${v}\.([\\w.]+)((?:\\.replace\\(\\s*'\\{([^}]+)\\}'\\s*,\\s*[^)]+\\s*\\)\\s*)+)\s*\}\}`, 'g')
    out = out.replace(reTplChain, (m, pathStr, chainText) => {
      const reOne = /\\.replace\\(\\s*'\\{([^}]+)\\}'\\s*,\\s*([^)]+)\\s*\\)/g
      const params = []
      let mg
      while ((mg = reOne.exec(chainText))) params.push(`${mg[1]}: ${mg[2]}`)
      return `{{ '${pathStr}' | i18n: { ${params.join(', ')} } }}`
    })
    const reSimple = new RegExp(`\{\{\s*${v}\.([\\w.]+)\s*\}\}`, 'g')
    out = out.replace(reSimple, (m, pathStr) => `{{ '${pathStr}' | i18n }}`)
  }
  return out
}

function processComponent(tsPath, srcDir) {
  const content = readFile(tsPath)
  if (!/@Component\(/.test(content)) return
  const sf = ts.createSourceFile(tsPath, content, { languageVersion: ts.ScriptTarget.Latest, scriptKind: ts.ScriptKind.TS })
  const serviceName = findServiceParamName(sf)
  const varNames = findLocaleVarNames(sf, serviceName)
  const dir = path.dirname(tsPath)
  const changesTs = []
  const m = content.match(/templateUrl\s*:\s*['"]([^'"]+)['"]/)
  let htmlKeys = []
  let changedTs = content
  const varRootOrder = collectVarRootOrder(sf, serviceName)
  if (m) {
    const htmlPath = path.join(dir, m[1])
    if (fs.existsSync(htmlPath)) {
      const htmlOld = readFile(htmlPath)
      htmlKeys = collectTemplateKeys(htmlOld, varNames)
    }
  }
  changedTs = replaceTsContent(content, serviceName, varNames, dir, srcDir, changesTs, tsPath, htmlKeys, varRootOrder)
  if (changedTs !== content) writeFile(tsPath, changedTs)
  if (m) {
    const htmlPath = path.join(dir, m[1])
    if (fs.existsSync(htmlPath)) {
      const htmlOld = readFile(htmlPath)
      const roots = new Set(varNames)
      const htmlNew = replaceHtmlContent(htmlOld, Array.from(roots))
      let next = htmlNew
      const changesHtml = []
      if (next === htmlOld) {
        for (const v of Array.from(roots)) {
          next = applyRegexWithLog(next, new RegExp(`\{\{\\s*${v}\\.([A-Za-z0-9_.]+)\\s*\}\}`, 'g'), (m, p1) => `{{ '${p1}' | i18n }}`, changesHtml, htmlPath, 'html', 'fallback template to pipe')
          next = applyRegexWithLog(next, new RegExp(`\{\{\\s*${v}\\.([A-Za-z0-9_.]+)((?:\\.replace\\(\\s*'\\{([^}]+)\\}'\\s*,\\s*[^)]+\\s*\\)\\s*)+)\\s*\}\}`, 'g'), (m, p1, p2) => {
            const reOne = /\\.replace\\(\\s*'\\{([^}]+)\\}'\\s*,\\s*([^)]+)\\s*\\)/g
            const params = []
            let mg
            while ((mg = reOne.exec(p2))) params.push(`${mg[1]}: ${mg[2]}`)
            return `{{ '${p1}' | i18n: { ${params.join(', ')} } }}`
          }, changesHtml, htmlPath, 'html', 'fallback template chain to pipe')
        }
      }
      if (next !== htmlOld) writeFile(htmlPath, next)
      return { tsChanges: changesTs, htmlChanges: changesHtml, htmlPath }
    }
  }
  return { tsChanges: changesTs, htmlChanges: [], htmlPath: null }
}

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
    results.push(entry)
    if (changes.htmlPath) {
      const relHtml = path.relative(process.cwd(), changes.htmlPath)
      const htmlChanged = changes.htmlChanges && changes.htmlChanges.length > 0
      const htmlEntry = { file: relHtml, changed: htmlChanged }
      if (htmlChanged) htmlEntry.changes = changes.htmlChanges
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
function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? prefix + '.' + k : k
    if (v && typeof v === 'object') flatten(v, key, out)
    else out[key] = v
  }
  return out
}

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
