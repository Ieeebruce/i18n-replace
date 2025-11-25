const fs = require('fs')
const path = require('path')

function readFile(p) {
  return fs.readFileSync(p, 'utf8')
}

function writeFile(p, content) {
  fs.writeFileSync(p, content, 'utf8')
}

function extractObject(source, constName) {
  const idx = source.indexOf(`export const ${constName}`)
  if (idx === -1) throw new Error(`Cannot find const ${constName}`)
  const eq = source.indexOf('=', idx)
  const start = source.indexOf('{', eq)
  let i = start
  let depth = 0
  while (i < source.length) {
    const ch = source[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        const end = i
        return source.slice(start, end + 1)
      }
    }
    i++
  }
  throw new Error('Unbalanced braces')
}

function tsObjectToJSON(tsObjText) {
  let s = tsObjText
  s = s.replace(/\r?\n/g, '\n')
  s = s.replace(/'(?:[^'\\]|\\.)*'/g, (m) => {
    return m.replace(/^'/, '"').replace(/'$/, '"')
  })
  s = s.replace(/([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '"$1":')
  s = s.replace(/,\s*([}\]])/g, '$1')
  return s
}

function get(obj, pathStr) {
  return pathStr.split('.').reduce((o, k) => (o ? o[k] : undefined), obj)
}

function addI18nToTag(line) {
  if (/i18n(\s|=|>)/.test(line)) return line
  return line.replace(/^(\s*<\w[\w-]*)/, '$1 i18n')
}

function tryResolvePath(zhPack, pathStr) {
  const val1 = get(zhPack, pathStr)
  if (typeof val1 === 'string') return val1
  if (pathStr.startsWith('T.')) {
    const val2 = get(zhPack, pathStr.slice(2))
    if (typeof val2 === 'string') return val2
  }
  return undefined
}

function transformInterpolationLine(line, zhPack, varNames) {
  let changed = line
  for (const v of varNames) {
    const reSimple = new RegExp(`\\{\\{\\s*${v}\\.([\\w.]+)\\s*\\}\\}`, 'g')
    changed = changed.replace(reSimple, (m, pathStr) => {
      const val = tryResolvePath(zhPack, pathStr)
      if (typeof val === 'string') return val
      return m
    })
  }
  if (changed !== line) changed = addI18nToTag(changed)

  for (const v of varNames) {
    const reReplace = new RegExp(`\\{\\{\\s*replace\\(\\s*${v}\\.([\\w.]+)\\s*,\\s*\\{([^}]*)\\}\\s*\\)\\s*\\}\\}`, 'g')
    changed = changed.replace(reReplace, (m, pathStr, paramsText) => {
      const tpl = tryResolvePath(zhPack, pathStr)
      if (typeof tpl !== 'string') return m
      const pairs = paramsText.split(',').map(s => s.trim()).filter(Boolean)
      const map = {}
      for (const p of pairs) {
        const m2 = p.match(/([A-Za-z_][\w]*)\s*:\s*(.+)$/)
        if (m2) map[m2[1]] = m2[2]
      }
      let out = tpl
      for (const [k, vExpr] of Object.entries(map)) {
        out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), `{{ ${vExpr} }}`)
      }
      return out
    })
  }
  if (changed !== line) changed = addI18nToTag(changed)

  return changed
}

function migrateHTML(filePath, zhPack, varNames) {
  const src = readFile(filePath)
  const lines = src.split(/\r?\n/)
  const out = lines.map(line => transformInterpolationLine(line, zhPack, varNames)).join('\n')
  if (out !== src) {
    writeFile(filePath, out)
    console.log(`Updated: ${path.relative(process.cwd(), filePath)}`)
  } else {
    console.log(`No changes: ${path.relative(process.cwd(), filePath)}`)
  }
}

function findI18nAlias(tsSource) {
  const m = tsSource.match(/import\s*\{([^}]*)\}\s*from\s*["']\.\/i18n["']/)
  if (!m) return null
  const inside = m[1]
  // Find exported T alias, e.g. "T as I18nT" or plain "T"
  const parts = inside.split(',').map(s => s.trim())
  for (const p of parts) {
    const ma = p.match(/^T\s+as\s+(\w+)/)
    if (ma) return ma[1]
    if (p === 'T') return 'T'
  }
  return null
}

function findTemplateVarNames(tsSource, alias) {
  const names = new Set()
  if (alias) {
    const reGetter = new RegExp(`get\\s+(\\w+)\\s*\\\(\\)\\s*\\{[^}]*return\\s+${alias}\\s*;`, 'g')
    let mg
    while ((mg = reGetter.exec(tsSource))) names.add(mg[1])
    const reField = new RegExp(`(\\w+)\\s*=\\s*${alias}\\s*;`, 'g')
    while ((mg = reField.exec(tsSource))) names.add(mg[1])
  }
  // constructor DI: capture parameter names and later filter by template usage
  const ctor = tsSource.match(/constructor\s*\(([^)]*)\)/)
  const diNames = new Set()
  if (ctor && ctor[1]) {
    const params = ctor[1].split(',')
    for (let p of params) {
      p = p.trim()
      const m = p.match(/(?:public|private|protected)?\s*(?:readonly\s*)?(\w+)\s*:/)
      if (m) diNames.add(m[1])
    }
  }
  // filter DI names by template usage to avoid false positives
  const templatePath = path.join(process.cwd(), 'src', 'app', 'app.component.html')
  const html = fs.existsSync(templatePath) ? readFile(templatePath) : ''
  for (const n of diNames) {
    const used = new RegExp(`\{\{\s*${n}\.`, 'm').test(html) || new RegExp(`replace\(\s*${n}\.`, 'm').test(html)
    if (used) names.add(n)
  }
  // Fallback: try common names
  if (names.size === 0) names.add('T')
  return Array.from(names)
}

function main() {
  const zhTs = path.join(process.cwd(), 'src', 'app', 'i18n', 'zh.ts')
  const tsSource = readFile(zhTs)
  const zhObjText = extractObject(tsSource, 'zh')
  const jsonText = tsObjectToJSON(zhObjText)
  const zhPack = JSON.parse(jsonText)

  const componentTs = path.join(process.cwd(), 'src', 'app', 'app.component.ts')
  const compSource = readFile(componentTs)
  const alias = findI18nAlias(compSource)
  const varNames = findTemplateVarNames(compSource, alias)

  const targetHtml = path.join(process.cwd(), 'src', 'app', 'app.component.html')
  migrateHTML(targetHtml, zhPack, varNames)
}

main()