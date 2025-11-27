"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const ast_1 = require("./ast");
function test(name, fn) {
    try {
        fn();
        console.log('PASS', name);
    }
    catch (e) {
        console.error('FAIL', name);
        console.error(e);
        process.exitCode = 1;
    }
}
test('createSourceFile parses class', () => {
    const code = `class A { constructor() {} }`;
    const sf = (0, ast_1.createSourceFile)('a.ts', code);
    assert_1.strict.ok(sf.statements.length > 0);
});
test('findServiceParamName detects injected name', () => {
    const code = `class C { constructor(private locale: I18nLocaleService) {} }`;
    const sf = (0, ast_1.createSourceFile)('c.ts', code);
    const name = (0, ast_1.findServiceParamName)(sf);
    assert_1.strict.equal(name, 'locale');
});
test('findServiceParamName detects injected name', () => {
    const code = `class C { constructor(private localService: I18nLocaleService) {} }`;
    const sf = (0, ast_1.createSourceFile)('c.ts', code);
    const name = (0, ast_1.findServiceParamName)(sf);
    assert_1.strict.equal(name, 'localService');
});
test('findServiceParamName detects injected name', () => {
    const code = `class C { constructor(public localService: I18nLocaleService) {} }`;
    const sf = (0, ast_1.createSourceFile)('c.ts', code);
    const name = (0, ast_1.findServiceParamName)(sf);
    assert_1.strict.equal(name, 'localService');
});
test('findServiceParamName fallback', () => {
    const code = `class C { constructor(private http: HttpClient) {} }`;
    const sf = (0, ast_1.createSourceFile)('c2.ts', code);
    const name = (0, ast_1.findServiceParamName)(sf);
    assert_1.strict.equal(name, 'locale');
});
test('findLocaleVarNames from property initializer getLocale', () => {
    const code = `class C { t = this.locale.getLocale(); constructor(private locale: I18nLocaleService) {} }`;
    const sf = (0, ast_1.createSourceFile)('c3.ts', code);
    const vars = (0, ast_1.findLocaleVarNames)(sf, 'locale');
    assert_1.strict.deepEqual(vars.sort(), ['t']);
});
test('findLocaleVarNames from property initializer getLocale', () => {
    const code = `class C { t = this.locale.getLocale(); constructor(private locale: I18nLocaleService) {
  this.i18n = this.locale.getLocale();
  } }`;
    const sf = (0, ast_1.createSourceFile)('c3.ts', code);
    const vars = (0, ast_1.findLocaleVarNames)(sf, 'locale');
    assert_1.strict.deepEqual(vars.sort(), ['i18n', 't']);
});
test('findLocaleVarNames from object spreads', () => {
    const code = `class C { m = { ...this.locale.get('home'), ...this.t.app }; t = this.locale.getLocale(); constructor(private locale: I18nLocaleService) {} }`;
    const sf = (0, ast_1.createSourceFile)('c4.ts', code);
    const vars = (0, ast_1.findLocaleVarNames)(sf, 'locale');
    assert_1.strict.ok(vars.includes('m'));
});
test('findLocaleVarNames from method returning getLocale', () => {
    const code = `class C { constructor(private locale: I18nLocaleService) {} getT(){ return this.locale.getLocale(); } }`;
    const sf = (0, ast_1.createSourceFile)('c5.ts', code);
    const vars = (0, ast_1.findLocaleVarNames)(sf, 'locale');
    assert_1.strict.ok(vars.includes('getT'));
});
test('collectVarRootOrder collects roots order', () => {
    const code = `class C { m = { ...this.locale.get('home'), ...this.t.app, ...this.locale.get('app') }; t = this.locale.getLocale(); constructor(private locale: I18nLocaleService) {} }`;
    const sf = (0, ast_1.createSourceFile)('c6.ts', code);
    const vars = (0, ast_1.findLocaleVarNames)(sf, 'locale');
    const order = (0, ast_1.collectVarRootOrder)(sf, 'locale', vars);
    const roots = order.get('m') || [];
    assert_1.strict.deepEqual(roots, ['home', 'app', 'app']);
});
test('collectTemplateKeys extracts keys from html', () => {
    const html = `{{ t.home.title }} <span>{{ t.app.name }}</span> {{ m.profile }}</span>`;
    const keys = (0, ast_1.collectTemplateKeys)(html, ['t', 'm']);
    assert_1.strict.ok(keys.includes('home.title'));
    assert_1.strict.ok(keys.includes('app.name'));
    assert_1.strict.ok(keys.includes('profile'));
});
test('resolveKeyFromContext returns exact with dot', () => {
    const k = (0, ast_1.resolveKeyFromContext)('home.title', []);
    assert_1.strict.equal(k, 'home.title');
});
test('resolveKeyFromContext unique suffix', () => {
    const k = (0, ast_1.resolveKeyFromContext)('title', ['home.title']);
    assert_1.strict.equal(k, 'home.title');
});
test('resolveKeyFromContext prefer app prefix', () => {
    const k = (0, ast_1.resolveKeyFromContext)('name', ['home.name', 'app.name']);
    assert_1.strict.equal(k, 'app.name');
});
test('flatten produces dot keys', () => {
    const obj = { a: { b: { c: 'x' } }, d: 'y' };
    const f = (0, ast_1.flatten)(obj);
    assert_1.strict.equal(f['a.b.c'], 'x');
    assert_1.strict.equal(f['d'], 'y');
});
test('resolveKey with packKeys', () => {
    const pack = new Set(['home.title', 'app.name']);
    assert_1.strict.equal((0, ast_1.resolveKey)('home.title', pack), 'home.title');
    assert_1.strict.equal((0, ast_1.resolveKey)('name', pack), 'app.name');
    assert_1.strict.equal((0, ast_1.resolveKey)('x', pack), 'x');
});
test('configurable serviceTypeName and getLocaleMethod', () => {
    const prev = {
        serviceTypeName: ast_1.i18nAstConfig.serviceTypeName,
        getLocaleMethod: ast_1.i18nAstConfig.getLocaleMethod,
        getMethod: ast_1.i18nAstConfig.getMethod,
    };
    ast_1.i18nAstConfig.serviceTypeName = 'MyLocaleService';
    ast_1.i18nAstConfig.getLocaleMethod = 'getLang';
    ast_1.i18nAstConfig.getMethod = 'getMsg';
    try {
        const code = `class C { t = this.locale.getLang(); m = { ...this.locale.getMsg('home') }; constructor(private locale: MyLocaleService) {} }`;
        const sf = (0, ast_1.createSourceFile)('c7.ts', code);
        const name = (0, ast_1.findServiceParamName)(sf);
        assert_1.strict.equal(name, 'locale');
        const vars = (0, ast_1.findLocaleVarNames)(sf, 'locale');
        assert_1.strict.ok(vars.includes('t'));
        const order = (0, ast_1.collectVarRootOrder)(sf, 'locale', ['m', 't']);
        const roots = order.get('m') || [];
        assert_1.strict.deepEqual(roots, ['home']);
    }
    finally {
        ast_1.i18nAstConfig.serviceTypeName = prev.serviceTypeName;
        ast_1.i18nAstConfig.getLocaleMethod = prev.getLocaleMethod;
        ast_1.i18nAstConfig.getMethod = prev.getMethod;
    }
});
