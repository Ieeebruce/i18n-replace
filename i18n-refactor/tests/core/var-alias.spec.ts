import ts from 'typescript'
import { collectVarAliases } from '../../src/core/var-alias'

test('alias from getLocal nested path', () => {
  const code = `class C { i18n: any; constructor(private local: I18nLocaleService){ this.i18n = this.local.getLocal().app.common } }`
  const sf = ts.createSourceFile('a.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const aliases = collectVarAliases(sf, 'local', 'getLocal')
  const a = aliases.find(x => x.name === 'i18n')
  expect(a?.prefix).toBe('app.common')
})

test('roots from getLocal spreads', () => {
  const code = `class C { i18n = { ...this.local.getLocal().common, ...this.local.getLocal().app }; constructor(private local: I18nLocaleService){} }`
  const sf = ts.createSourceFile('b.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const aliases = collectVarAliases(sf, 'local', 'getLocal')
  const a = aliases.find(x => x.name === 'i18n')
  expect(a?.roots).toEqual(['common','app'])
})

test('multiple aliases from repeated getLocal calls', () => {
  const code = `class C { i18n: any; dict: any; constructor(private local: I18nLocaleService){ this.i18n = this.local.getLocal().app.common; this.dict = { ...this.local.getLocal().common, ...this.local.getLocal().user } } }`
  const sf = ts.createSourceFile('c.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const aliases = collectVarAliases(sf, 'local', 'getLocal')
  const a = aliases.find(x => x.name === 'i18n')
  const b = aliases.find(x => x.name === 'dict')
  expect(a?.prefix).toBe('app.common')
  expect(a?.roots).toEqual([])
  expect(b?.prefix).toBeNull()
  expect(b?.roots).toEqual(['common','user'])
})
