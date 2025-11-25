const fs = require('fs')
const path = require('path')
const { readFile, extractObject, tsObjectToJSON } = require('./lib/i18n-utils')

function main() {
  const zhTs = path.join(process.cwd(), 'src', 'app', 'i18n', 'zh.ts')
  const enTs = path.join(process.cwd(), 'src', 'app', 'i18n', 'en.ts')
  const packs = {}
  try {
    const text = extractObject(readFile(zhTs), 'zh')
    packs.zh = JSON.parse(tsObjectToJSON(text))
  } catch (e) {}
  try {
    const text = extractObject(readFile(enTs), 'en')
    packs.en = JSON.parse(tsObjectToJSON(text))
  } catch (e) {}
  // optional merged packs (Object.assign order: A <- B <- C)
  try {
    const zhA = JSON.parse(tsObjectToJSON(extractObject(readFile(zhTs), 'zhA')))
    const zhB = JSON.parse(tsObjectToJSON(extractObject(readFile(zhTs), 'zhB')))
    const zhC = JSON.parse(tsObjectToJSON(extractObject(readFile(zhTs), 'zhC')))
    packs.zhMerged = Object.assign({}, zhA, zhB, zhC)
  } catch {}
  try {
    const enA = JSON.parse(tsObjectToJSON(extractObject(readFile(enTs), 'enA')))
    const enB = JSON.parse(tsObjectToJSON(extractObject(readFile(enTs), 'enB')))
    const enC = JSON.parse(tsObjectToJSON(extractObject(readFile(enTs), 'enC')))
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