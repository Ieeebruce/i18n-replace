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
    assert_1.strict.equal(name, ast_1.i18nAstConfig.fallbackServiceParamName);
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
test('collectTemplateKeys alias L with replace chain', () => {
    const html = `{{ L.app.title }} {{ L.templates.info.replace('{name}', '张三').replace('{count}', '3') }} {{ L.user.greetTpl.replace('{name}', '李四') }}`;
    const keys = (0, ast_1.collectTemplateKeys)(html, ['L']);
    assert_1.strict.ok(keys.includes('app.title'));
    assert_1.strict.ok(keys.includes('templates.info.replace'));
    assert_1.strict.ok(keys.includes('user.greetTpl.replace'));
});
test('collectTemplateKeys i18n variable with list and template', () => {
    const html = `{{ i18n.app.title }} {{ i18n.app.description }} {{ i18n.home.welcome }} {{ i18n.templates.itemTpl.replace('{index}', i).replace('{value}', it) }} {{ i18n.list.items }}`;
    const keys = (0, ast_1.collectTemplateKeys)(html, ['i18n']);
    assert_1.strict.ok(keys.includes('app.title'));
    assert_1.strict.ok(keys.includes('app.description'));
    assert_1.strict.ok(keys.includes('home.welcome'));
    assert_1.strict.ok(keys.includes('templates.itemTpl.replace'));
    assert_1.strict.ok(keys.includes('list.items'));
});
test('findLocaleVarNames detects dict assigned in constructor', () => {
    const code = `class C { dict: any; constructor(private locale: I18nLocaleService) { this.dict = this.locale.getLocale(); } }`;
    const sf = (0, ast_1.createSourceFile)('c8.ts', code);
    const vars = (0, ast_1.findLocaleVarNames)(sf, 'locale');
    assert_1.strict.ok(vars.includes('dict'));
});
test('collectVarRootOrder for constructor spreads with service and var', () => {
    const code = `class C { t = this.locale.getLocale(); m: any; constructor(private locale: I18nLocaleService) { this.m = { ...this.locale.get('home'), ...this.t.app, ...this.locale.get('app') } } }`;
    const sf = (0, ast_1.createSourceFile)('c9.ts', code);
    const vars = (0, ast_1.findLocaleVarNames)(sf, 'locale');
    const order = (0, ast_1.collectVarRootOrder)(sf, 'locale', vars);
    const roots = order.get('m') || [];
    assert_1.strict.deepEqual(roots, ['home', 'app', 'app']);
});
test('resolveKeyFromContext with single candidate prefers app', () => {
    const k = (0, ast_1.resolveKeyFromContext)('switchToZh', ['app.switchToZh']);
    assert_1.strict.equal(k, 'app.switchToZh');
});
test('flatten handles arrays', () => {
    const obj = { list: { items: ['项目一', '项目二'] } };
    const f = (0, ast_1.flatten)(obj);
    assert_1.strict.equal(f['list.items.0'], '项目一');
    assert_1.strict.equal(f['list.items.1'], '项目二');
});
test('resolveKey typical entries', () => {
    const pack = new Set([
        'app.title',
        'app.description',
        'home.welcome',
        'templates.info',
        'templates.itemTpl',
        'user.greetTpl',
        'list.items'
    ]);
    assert_1.strict.equal((0, ast_1.resolveKey)('title', pack), 'app.title');
    assert_1.strict.equal((0, ast_1.resolveKey)('description', pack), 'app.description');
    assert_1.strict.equal((0, ast_1.resolveKey)('welcome', pack), 'home.welcome');
    assert_1.strict.equal((0, ast_1.resolveKey)('info', pack), 'templates.info');
    assert_1.strict.equal((0, ast_1.resolveKey)('greetTpl', pack), 'user.greetTpl');
});
test('collectVarRefUsages positions and paths', () => {
    const code = `class C { t = this.locale.getLocale(); constructor(private locale: I18nLocaleService) { const x = this.t.app.title } }`;
    const sf = (0, ast_1.createSourceFile)('r5.ts', code);
    const vars = (0, ast_1.findLocaleVarNames)(sf, 'locale');
    const usages = (0, ast_1.collectVarRefUsages)(sf, 'r5.ts', 'locale', vars);
    const paths = usages.map(u => u.keyPath);
    assert_1.strict.ok(paths.includes('app.title'));
    assert_1.strict.ok(usages[0].range.start > 0);
});
test('collectVarRefUsages dynamic element access', () => {
    const code = `class C { t = this.locale.getLocale(); constructor(private locale: I18nLocaleService) { const x = this.t.app[key] } }`;
    const sf = (0, ast_1.createSourceFile)('r6.ts', code);
    const vars = (0, ast_1.findLocaleVarNames)(sf, 'locale');
    const usages = (0, ast_1.collectVarRefUsages)(sf, 'r6.ts', 'locale', vars);
    const u = usages.find(u => u.rootVar === 't');
    assert_1.strict.ok(u);
    assert_1.strict.equal(u.keyPath, 'app');
    assert_1.strict.ok(u.dynamicSegments && u.dynamicSegments.includes('key'));
});
test('collectVarRefUsages element literal becomes static path', () => {
    const code = `class C { t = this.locale.getLocale(); constructor(private locale: I18nLocaleService) { const x = this.t.app['title'] } }`;
    const sf = (0, ast_1.createSourceFile)('r7.ts', code);
    const vars = (0, ast_1.findLocaleVarNames)(sf, 'locale');
    const usages = (0, ast_1.collectVarRefUsages)(sf, 'r7.ts', 'locale', vars);
    const paths = usages.map(u => u.keyPath);
    assert_1.strict.ok(paths.includes('app.title'));
});
test('collectAngularTemplateUsages inline template simple', () => {
    const code = `@Component({ template: "{{ i18n.app.title }}" }) export class C { i18n = this.locale.getLocale(); constructor(public locale: I18nLocaleService) {} }`;
    const sf = (0, ast_1.createSourceFile)('cmp.ts', code);
    const tUsages = (0, ast_1.collectAngularTemplateUsages)(sf, 'cmp.ts', ['i18n']);
    assert_1.strict.ok(tUsages.some(u => u.keyPath === 'app.title'));
});
test('collectAngularTemplateUsages inline template dynamic index', () => {
    const code = `@Component({ template: "{{ i18n.app[key] }}" }) export class C { i18n = this.locale.getLocale(); key = 'title'; constructor(public locale: I18nLocaleService) {} }`;
    const sf = (0, ast_1.createSourceFile)('cmp3.ts', code);
    const tUsages = (0, ast_1.collectAngularTemplateUsages)(sf, 'cmp3.ts', ['i18n']);
    const u = tUsages.find(u => u.varName === 'i18n');
    assert_1.strict.ok(u);
    assert_1.strict.equal(u.keyPath, 'app');
    assert_1.strict.ok(u.dynamicSegments && u.dynamicSegments.includes('key'));
});
test('collectI18nUsageReport aggregates ts and templates', () => {
    const code = `@Component({ template: "{{ dict.home.welcome }}" }) export class C { dict: any; constructor(private locale: I18nLocaleService){ this.dict = this.locale.getLocale(); const z = this.dict.app.title } }`;
    const sf = (0, ast_1.createSourceFile)('cmp2.ts', code);
    const report = (0, ast_1.collectI18nUsageReport)(sf, 'cmp2.ts');
    assert_1.strict.ok(report.tsUsages.some(u => u.keyPath === 'app.title'));
    assert_1.strict.ok(report.templateUsages.some(u => u.keyPath === 'home.welcome'));
});
test('collectVarRefsRecursive simple root var chain', () => {
    const code = `class C { t = this.locale.getLocale(); constructor(private locale: I18nLocaleService) { const a = this.t.app; const b = a.title; const x = this.t.app.title; } }`;
    const sf = (0, ast_1.createSourceFile)('r1.ts', code);
    const vars = (0, ast_1.findLocaleVarNames)(sf, 'locale');
    const refs = (0, ast_1.collectVarRefsRecursive)(sf, 'locale', vars);
    const set = Array.from(refs.get('t') || []).sort();
    assert_1.strict.ok(set.includes('app'));
    assert_1.strict.ok(set.includes('app.title'));
});
test('collectVarRefsRecursive constructor alias chain', () => {
    const code = `class C { i18n: any; constructor(private locale: I18nLocaleService) { const local = this.locale.getLocale().app; this.i18n = local; const t = this.i18n.title; } }`;
    const sf = (0, ast_1.createSourceFile)('r2.ts', code);
    const vars = (0, ast_1.findLocaleVarNames)(sf, 'locale');
    const refs = (0, ast_1.collectVarRefsRecursive)(sf, 'locale', vars.concat(['i18n']));
    const set = Array.from(refs.get('i18n') || []).sort();
    assert_1.strict.ok(set.includes('app.title'));
});
test('collectVarRefsRecursive spreads', () => {
    const code = `class C { t = this.locale.getLocale(); m = { ...this.t.app }; constructor(private locale: I18nLocaleService) { } }`;
    const sf = (0, ast_1.createSourceFile)('r3.ts', code);
    const vars = (0, ast_1.findLocaleVarNames)(sf, 'locale');
    const refs = (0, ast_1.collectVarRefsRecursive)(sf, 'locale', vars);
    const set = Array.from(refs.get('t') || []).sort();
    assert_1.strict.ok(set.includes('app'));
});
test('collectVarRefsRecursive dict and template', () => {
    const code = `class C { dict: any; constructor(private locale: I18nLocaleService) { this.dict = this.locale.getLocale(); const s = this.dict.templates.info; } }`;
    const sf = (0, ast_1.createSourceFile)('r4.ts', code);
    const vars = (0, ast_1.findLocaleVarNames)(sf, 'locale');
    const refs = (0, ast_1.collectVarRefsRecursive)(sf, 'locale', vars);
    const set = Array.from(refs.get('dict') || []).sort();
    assert_1.strict.ok(set.includes('templates.info'));
});
