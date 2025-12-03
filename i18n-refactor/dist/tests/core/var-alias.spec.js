"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const typescript_1 = __importDefault(require("typescript"));
const var_alias_1 = require("../../src/core/var-alias");
test('alias from getLocal nested path', () => {
    const code = `class C { i18n: any; constructor(private local: I18nLocaleService){ this.i18n = this.local.getLocal().app.common } }`;
    const sf = typescript_1.default.createSourceFile('a.ts', code, typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS);
    const aliases = (0, var_alias_1.collectVarAliases)(sf, 'local', 'getLocal');
    const a = aliases.find(x => x.name === 'i18n');
    expect(a === null || a === void 0 ? void 0 : a.prefix).toBe('app.common');
});
test('roots from getLocal spreads', () => {
    const code = `class C { i18n = { ...this.local.getLocal().common, ...this.local.getLocal().app }; constructor(private local: I18nLocaleService){} }`;
    const sf = typescript_1.default.createSourceFile('b.ts', code, typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS);
    const aliases = (0, var_alias_1.collectVarAliases)(sf, 'local', 'getLocal');
    const a = aliases.find(x => x.name === 'i18n');
    expect(a === null || a === void 0 ? void 0 : a.roots).toEqual(['common', 'app']);
});
test('multiple aliases from repeated getLocal calls', () => {
    const code = `class C { i18n: any; dict: any; constructor(private local: I18nLocaleService){ this.i18n = this.local.getLocal().app.common; this.dict = { ...this.local.getLocal().common, ...this.local.getLocal().user } } }`;
    const sf = typescript_1.default.createSourceFile('c.ts', code, typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS);
    const aliases = (0, var_alias_1.collectVarAliases)(sf, 'local', 'getLocal');
    const a = aliases.find(x => x.name === 'i18n');
    const b = aliases.find(x => x.name === 'dict');
    expect(a === null || a === void 0 ? void 0 : a.prefix).toBe('app.common');
    expect(a === null || a === void 0 ? void 0 : a.roots).toEqual([]);
    expect(b === null || b === void 0 ? void 0 : b.prefix).toBeNull();
    expect(b === null || b === void 0 ? void 0 : b.roots).toEqual(['common', 'user']);
});
