"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const typescript_1 = __importDefault(require("typescript"));
const prune_1 = require("../../src/replace/prune");
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
`;
    const sf = typescript_1.default.createSourceFile('p.ts', code, typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS);
    const out = (0, prune_1.pruneUnused)(sf, code, []); // varNames is ignored now
    // Should remove 'local: any;'
    expect(out.deleted).toContain('local: any;');
    expect(out.code).not.toContain('local: any;');
    // Should remove 'ui: any;'
    expect(out.deleted).toContain('ui: any;');
    expect(out.code).not.toContain('ui: any;');
    // Should remove assignments
    expect(out.deleted).toContain('this.local = this.svc.getLocale();');
    expect(out.code).not.toContain('this.local = this.svc.getLocale()');
    expect(out.deleted).toContain('this.ui = this.svc.getLocale().ui;');
    expect(out.code).not.toContain('this.ui = this.svc.getLocale().ui');
    // Should remove local variable
    expect(out.deleted).toContain('const x = this.svc.getLocale();');
    expect(out.code).not.toContain('const x = this.svc.getLocale()');
});
test('prune handles property declaration after assignment (if any)', () => {
    // Usually TS requires decl first or uses 'this', but checking just in case order doesn't matter for detection
    const code = `
class C {
  constructor(private svc: I18nLocaleService) {
    this.local = this.svc.getLocale();
  }
  local: any;
}
`;
    const sf = typescript_1.default.createSourceFile('p.ts', code, typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS);
    const out = (0, prune_1.pruneUnused)(sf, code, []);
    expect(out.deleted).toContain('local: any;');
    expect(out.code).not.toContain('local: any;');
    expect(out.deleted).toContain('this.local = this.svc.getLocale();');
    expect(out.code).not.toContain('this.local = this.svc.getLocale()');
});
test('does not prune unrelated properties', () => {
    const code = `
class C {
  other: any;
  constructor(private svc: I18nLocaleService) {
    this.other = 123;
  }
}
`;
    const sf = typescript_1.default.createSourceFile('p.ts', code, typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS);
    const out = (0, prune_1.pruneUnused)(sf, code, []);
    expect(out.deleted).toHaveLength(0);
    expect(out.code).toContain('other: any;');
    expect(out.code).toContain('this.other = 123');
});
