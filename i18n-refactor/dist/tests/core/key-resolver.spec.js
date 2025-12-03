"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const typescript_1 = __importDefault(require("typescript"));
const key_resolver_1 = require("../../src/core/key-resolver");
function expr(code) {
    const sf = typescript_1.default.createSourceFile('x.ts', code, typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS);
    const stmt = sf.statements[0];
    return stmt.expression;
}
test('resolve with alias prefix single segment', () => {
    const e = expr(`this.i18n.title`);
    const r = (0, key_resolver_1.resolveKeyFromAccess)(typescript_1.default.createSourceFile('x.ts', '', typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS), e, 'app.common', []);
    expect(r.keyExpr).toBe('app.common.title');
});
test('resolve multi segments with alias prefix', () => {
    const e = expr(`this.i18n.user.name`);
    const r = (0, key_resolver_1.resolveKeyFromAccess)(typescript_1.default.createSourceFile('x.ts', '', typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS), e, 'app.common', []);
    expect(r.keyExpr).toBe('app.common.user.name');
});
test('resolve index literal', () => {
    const e = expr(`this.i18n.list['items']`);
    const r = (0, key_resolver_1.resolveKeyFromAccess)(typescript_1.default.createSourceFile('x.ts', '', typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS), e, 'app.common', []);
    expect(r.keyExpr).toBe('app.common.list.items');
});
test('resolve index expr', () => {
    const e = expr(`this.i18n.list[idx]`);
    const r = (0, key_resolver_1.resolveKeyFromAccess)(typescript_1.default.createSourceFile('x.ts', '', typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS), e, 'app.common', []);
    expect(r.keyExpr).toBe("'app.common.list.' + idx");
});
