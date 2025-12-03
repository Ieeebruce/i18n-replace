import ts from 'typescript'
import { resolveKeyFromAccess } from '../../src/core/key-resolver'

function expr(code: string): ts.Expression {
  const sf = ts.createSourceFile('x.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const stmt = sf.statements[0] as ts.ExpressionStatement
  return stmt.expression
}

test('resolve with alias prefix single segment', () => {
  const e = expr(`this.i18n.title`)
  const r = resolveKeyFromAccess(ts.createSourceFile('x.ts','',ts.ScriptTarget.Latest,true,ts.ScriptKind.TS), e, 'app.common', [])
  expect(r.keyExpr).toBe('app.common.title')
})

test('resolve multi segments with alias prefix', () => {
  const e = expr(`this.i18n.user.name`)
  const r = resolveKeyFromAccess(ts.createSourceFile('x.ts','',ts.ScriptTarget.Latest,true,ts.ScriptKind.TS), e, 'app.common', [])
  expect(r.keyExpr).toBe('app.common.user.name')
})

test('resolve index literal', () => {
  const e = expr(`this.i18n.list['items']`)
  const r = resolveKeyFromAccess(ts.createSourceFile('x.ts','',ts.ScriptTarget.Latest,true,ts.ScriptKind.TS), e, 'app.common', [])
  expect(r.keyExpr).toBe('app.common.list.items')
})

test('resolve index expr', () => {
  const e = expr(`this.i18n.list[idx]`)
  const r = resolveKeyFromAccess(ts.createSourceFile('x.ts','',ts.ScriptTarget.Latest,true,ts.ScriptKind.TS), e, 'app.common', [])
  expect(r.keyExpr).toBe("'app.common.list.' + idx")
})
