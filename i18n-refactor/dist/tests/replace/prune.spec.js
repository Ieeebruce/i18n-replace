"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const typescript_1 = __importDefault(require("typescript"));
const prune_1 = require("../../src/replace/prune");
test('prune unused getLocal assign and decl', () => {
    const code = `class C {  constructor(private localService: I18nLocaleService){  const a = 1 } }`;
    const sf = typescript_1.default.createSourceFile('p.ts', code, typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS);
    const out = (0, prune_1.pruneUnused)(sf, code, ['local']);
    expect(out).not.toContain('this.local = this.localService.getLocal()');
    expect(out).not.toContain('local: any');
});
