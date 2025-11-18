const fs = require('fs')
const path = require('path')
const { readFile, mapTemplateToVarNames } = require('./lib/i18n-utils')

function verifyFile(htmlPath, varNames) {
  const src = readFile(htmlPath)
  const remaining = []
  for (const v of varNames) {
    const re = new RegExp(`\{\{\s*${v}\.`, 'm')
    if (re.test(src)) remaining.push(v)
  }
  const hasI18n = /<\w[\w-]*\s[^>]*\bi18n\b/.test(src)
  return { remaining, hasI18n }
}

function main() {
  const map = mapTemplateToVarNames(process.cwd())
  const items = []
  for (const [htmlPath, varNames] of map.entries()) {
    const v = verifyFile(htmlPath, varNames)
    items.push({ file: path.relative(process.cwd(), htmlPath), remaining: v.remaining, hasI18n: v.hasI18n })
  }
  const unresolved = items.filter(i => i.remaining.length > 0)
  const summary = { files: items.length, unresolved: unresolved.length, withI18n: items.filter(i => i.hasI18n).length }
  const json = JSON.stringify({ summary, items }, null, 2) + '\n'
  process.stdout.write(json)
  const outDir = path.join(process.cwd(), 'scripts', 'out')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'i18n-report.json'), json, 'utf8')
}

main()