import ts from 'typescript'
import { pruneUnused } from '../../src/replace/prune'

test('prune unused getLocal assign and decl', () => {
  const code = `
class C {
  local: any;
  ui: any;
  constructor(private svc: I18nLocaleService) {
    this.local = this.svc.getLocale();
    this.ui = this.svc.getLocale().ui;
    const x = this.svc.getLocale();
  }
}
`
  const sf = ts.createSourceFile('p.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const out = pruneUnused(sf, code, []) // varNames is ignored now
  
  // Should remove 'local: any;'
  expect(out.deleted).toContain('local: any;')
  expect(out.code).not.toContain('local: any;')
  
  // Should remove 'ui: any;'
  expect(out.deleted).toContain('ui: any;')
  expect(out.code).not.toContain('ui: any;')
  
  // Should remove assignments
  expect(out.deleted).toContain('this.local = this.svc.getLocale();')
  expect(out.code).not.toContain('this.local = this.svc.getLocale()')
  
  expect(out.deleted).toContain('this.ui = this.svc.getLocale().ui;')
  expect(out.code).not.toContain('this.ui = this.svc.getLocale().ui')
  
  // Should remove local variable
  expect(out.deleted).toContain('const x = this.svc.getLocale();')
  expect(out.code).not.toContain('const x = this.svc.getLocale()')
})

test('prune handles property declaration after assignment (if any)', () => {
  // Usually TS requires decl first or uses 'this', but checking just in case order doesn't matter for detection
  const code = `
class C {
  constructor(private svc: I18nLocaleService) {
    this.local = this.svc.getLocale();
  }
  local: any;
}
`
  const sf = ts.createSourceFile('p.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const out = pruneUnused(sf, code, [])
  
  expect(out.deleted).toContain('local: any;')
  expect(out.code).not.toContain('local: any;')
  expect(out.deleted).toContain('this.local = this.svc.getLocale();')
  expect(out.code).not.toContain('this.local = this.svc.getLocale()')
})

test('does not prune unrelated properties', () => {
  const code = `
class C {
  other: any;
  constructor(private svc: I18nLocaleService) {
    this.other = 123;
  }
}
`
  const sf = ts.createSourceFile('p.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const out = pruneUnused(sf, code, [])
  
  expect(out.deleted).toHaveLength(0)
  expect(out.code).toContain('other: any;')
  expect(out.code).toContain('this.other = 123')
})
