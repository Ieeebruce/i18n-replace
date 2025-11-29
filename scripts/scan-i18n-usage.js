const fs = require('fs')
const path = require('path')
const ts = require('typescript')
const { readFile, walk } = require('./lib/i18n-utils')
const { createSourceFile, collectI18nUsageReport } = require('./dist/utils/ast')

function main() {
  const args = process.argv.slice(2)
  let srcDirName = 'src'
  for (const a of args) {
    const m = a.match(/^--dir=(.+)$/)
    if (m) srcDirName = m[1]
    else if (!a.startsWith('--')) srcDirName = a
  }
  const srcDir = path.join(process.cwd(), srcDirName)
  const tsFiles = walk(srcDir, p => p.endsWith('.ts'))
  const out = []
  for (const f of tsFiles) {
    const code = readFile(f)
    const sf = createSourceFile(f, code)
    const usage = collectI18nUsageReport(sf, f)
    const entry = {
      tsFile: path.relative(process.cwd(), f),
      tsUsages: usage.tsUsages,
      templateUsages: usage.templateUsages
    }
    out.push(entry)
  }
  const json = JSON.stringify({ files: out.length, items: out }, null, 2) + '\n'
  process.stdout.write(json)
  const outDir = path.join(process.cwd(), 'scripts', 'out')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'i18n-scan.json'), json, 'utf8')
}

main()
