const fs = require('fs')
const path = require('path')
const { readFile, extractObject, tsObjectToJSON, migrateHTML, mapTemplateToVarNames } = require('./lib/i18n-utils')

function main() {
  const i18nTs = path.join(process.cwd(), 'src', 'app', 'i18n', 'index.ts')
  const tsSource = readFile(i18nTs)
  let zhPack
  try {
    const zhA = JSON.parse(tsObjectToJSON(extractObject(tsSource, 'zhA')))
    const zhB = JSON.parse(tsObjectToJSON(extractObject(tsSource, 'zhB')))
    const zhC = JSON.parse(tsObjectToJSON(extractObject(tsSource, 'zhC')))
    zhPack = Object.assign({}, zhA, zhB, zhC)
  } catch {
    const zhText = extractObject(tsSource, 'zh')
    zhPack = JSON.parse(tsObjectToJSON(zhText))
  }
  const map = mapTemplateToVarNames(process.cwd())
  const results = []
  for (const [htmlPath, varNames] of map.entries()) {
    const html = readFile(htmlPath)
    const mAll = html.match(/\{\{\s*([A-Za-z_]\w*)\./g) || []
    const roots = new Set(varNames)
    for (const m of mAll) {
      const n = (m.match(/\{\{\s*([A-Za-z_]\w*)\./) || [])[1]
      if (n) roots.add(n)
    }
    const changed = migrateHTML(htmlPath, zhPack, Array.from(roots))
    results.push({ file: path.relative(process.cwd(), htmlPath), changed })
  }
  const json = JSON.stringify({ changed: results.filter(r => r.changed).length, results }, null, 2) + '\n'
  process.stdout.write(json)
  const outDir = path.join(process.cwd(), 'scripts', 'out')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'i18n-replace.json'), json, 'utf8')
}

main()