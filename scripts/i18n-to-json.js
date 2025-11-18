const fs = require('fs')
const path = require('path')
const { readFile, extractObject, tsObjectToJSON } = require('./lib/i18n-utils')

function main() {
  const i18nTs = path.join(process.cwd(), 'src', 'app', 'i18n', 'index.ts')
  const tsSource = readFile(i18nTs)
  const packs = {}
  for (const name of ['zh', 'en']) {
    try {
      const text = extractObject(tsSource, name)
      const json = tsObjectToJSON(text)
      packs[name] = JSON.parse(json)
    } catch (e) {}
  }
  // optional merged packs (Object.assign order: A <- B <- C)
  try {
    const zhA = JSON.parse(tsObjectToJSON(extractObject(tsSource, 'zhA')))
    const zhB = JSON.parse(tsObjectToJSON(extractObject(tsSource, 'zhB')))
    const zhC = JSON.parse(tsObjectToJSON(extractObject(tsSource, 'zhC')))
    packs.zhMerged = Object.assign({}, zhA, zhB, zhC)
  } catch {}
  try {
    const enA = JSON.parse(tsObjectToJSON(extractObject(tsSource, 'enA')))
    const enB = JSON.parse(tsObjectToJSON(extractObject(tsSource, 'enB')))
    const enC = JSON.parse(tsObjectToJSON(extractObject(tsSource, 'enC')))
    packs.enMerged = Object.assign({}, enA, enB, enC)
  } catch {}
  const out = JSON.stringify(packs, null, 2)
  process.stdout.write(out + '\n')
  const outDir = path.join(process.cwd(), 'scripts', 'out')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, 'i18n-packs.json')
  fs.writeFileSync(outFile, out + '\n', 'utf8')
}

main()