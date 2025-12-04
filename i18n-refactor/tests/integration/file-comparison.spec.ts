import * as fs from 'fs'
import * as path from 'path'
import { processComponent } from '../../src/runner/component'
import { setDictDir } from '../../src/util/dict-reader'

const FIXTURES_DIR = path.join(__dirname, 'fixtures')

function readFile(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8')
}

function ignoreSpaces(s: string): string {
  return s.replace(/\s+/g, '')
}

describe('Integration: File Comparison', () => {
  beforeAll(() => {
    // Point to the actual i18n directory in the demo project
    // __dirname is .../i18n-refactor/tests/integration
    // project root is .../i18n-demo
    const projectRoot = path.resolve(__dirname, '../../../')
    const dictPath = path.join(projectRoot, 'src/app/i18n')
    setDictDir(dictPath)
  })

  test('should process complex component and match expected file content', () => {
    const tsIn = readFile('complex.in.ts')
    const htmlIn = readFile('complex.in.html')
    const tsExpect = readFile('complex.expect.ts')
    const htmlExpect = readFile('complex.expect.html')

    const { tsOut, htmlOut } = processComponent(tsIn, htmlIn)

    // Debug output if test fails
    if (ignoreSpaces(tsOut) !== ignoreSpaces(tsExpect)) {
      console.log('TS Output Differs:')
      console.log('Expected (normalized):', ignoreSpaces(tsExpect))
      console.log('Actual (normalized):  ', ignoreSpaces(tsOut))
      console.log('Actual Full:\n', tsOut)
    }

    expect(ignoreSpaces(tsOut)).toBe(ignoreSpaces(tsExpect))
    expect(ignoreSpaces(htmlOut)).toBe(ignoreSpaces(htmlExpect))
  })
})
