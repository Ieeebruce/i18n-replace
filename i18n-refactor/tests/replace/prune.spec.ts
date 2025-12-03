import ts from 'typescript'
import { pruneUnused } from '../../src/replace/prune'

test('prune unused getLocal assign and decl', () => {
  const code = `class C {  constructor(private localService: I18nLocaleService){  const a = 1 } }`
  const sf = ts.createSourceFile('p.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const out = pruneUnused(sf, code, ['local'])
  expect(out).not.toContain('this.local = this.localService.getLocal()')
  expect(out).not.toContain('local: any')
})
