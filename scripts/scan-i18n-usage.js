const fs = require('fs')
const path = require('path')
const { readFile, mapTemplateToVarNames } = require('./lib/i18n-utils')

function scanFile(htmlPath, varNames) {
  const src = readFile(htmlPath)
  const findings = []
  // broaden root var discovery from template itself
  const rootVars = new Set(varNames)
  const mAll = src.match(/\{\{\s*([A-Za-z_]\w*)\./g) || []
  for (const m of mAll) {
    const n = (m.match(/\{\{\s*([A-Za-z_]\w*)\./) || [])[1]
    if (n) rootVars.add(n)
  }
  for (const v of rootVars) {
    const reSimple = new RegExp(`\\{\\{\\s*${v}\\.([\\w.]+)\\s*\\}\\}`, 'g')
    const reReplace = new RegExp(`\\{\\{\\s*replace\\(\\s*${v}\\.([\\w.]+)\\s*,\\s*\\{([^}]*)\\}\\s*\\)\\s*\\}\\}`, 'g')
    let m
    while ((m = reSimple.exec(src))) findings.push({ type: 'simple', var: v, path: m[1] })
    while ((m = reReplace.exec(src))) findings.push({ type: 'replace', var: v, path: m[1] })
  }
  return findings
}

function main() {
  const map = mapTemplateToVarNames(process.cwd())
  const report = []
  for (const [htmlPath, varNames] of map.entries()) {
    const findings = scanFile(htmlPath, varNames)
    report.push({ file: path.relative(process.cwd(), htmlPath), varNames, count: findings.length, findings })
  }
  const json = JSON.stringify(report, null, 2) + '\n'
  process.stdout.write(json)
  const outDir = path.join(process.cwd(), 'scripts', 'out')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'i18n-scan.json'), json, 'utf8')
}

main()