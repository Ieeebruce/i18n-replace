import { strict as assert } from 'assert';
import {
  createSourceFile,
  findServiceParamName,
  findLocaleVarNames,
  collectVarRootOrder,
  collectTemplateKeys,
  resolveKeyFromContext,
  flatten,
  resolveKey,
  i18nAstConfig,
  collectVarRefsRecursive,
  collectVarRefUsages,
  collectAngularTemplateUsages,
  collectI18nUsageReport,
} from './ast';

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log('PASS', name);
  } catch (e) {
    console.error('FAIL', name);
    console.error(e);
    process.exitCode = 1;
  }
}

test('createSourceFile parses class', () => {
  const code = `class A { constructor() {} }`;
  const sf = createSourceFile('a.ts', code);
  assert.ok(sf.statements.length > 0);
});

test('findServiceParamName detects injected name', () => {
  const code = `class C { constructor(private locale: I18nLocaleService) {} }`;
  const sf = createSourceFile('c.ts', code);
  const name = findServiceParamName(sf);
  assert.equal(name, 'locale');
});

test('findServiceParamName detects injected name', () => {
  const code = `class C { constructor(private localService: I18nLocaleService) {} }`;
  const sf = createSourceFile('c.ts', code);
  const name = findServiceParamName(sf);
  assert.equal(name, 'localService');
});

test('findServiceParamName detects injected name', () => {
  const code = `class C { constructor(public localService: I18nLocaleService) {} }`;
  const sf = createSourceFile('c.ts', code);
  const name = findServiceParamName(sf);
  assert.equal(name, 'localService');
});

test('findServiceParamName fallback', () => {
  const code = `class C { constructor(private http: HttpClient) {} }`;
  const sf = createSourceFile('c2.ts', code);
  const name = findServiceParamName(sf);
  assert.equal(name, i18nAstConfig.fallbackServiceParamName);
});

test('findLocaleVarNames from property initializer getLocale', () => {
  const code = `class C { t = this.locale.getLocale(); constructor(private locale: I18nLocaleService) {} }`;
  const sf = createSourceFile('c3.ts', code);
  const vars = findLocaleVarNames(sf, 'locale');
  assert.deepEqual(vars.sort(), ['t']);
});

test('findLocaleVarNames from property initializer getLocale', () => {
  const code = `class C { t = this.locale.getLocale(); constructor(private locale: I18nLocaleService) {
  this.i18n = this.locale.getLocale();
  } }`;
  const sf = createSourceFile('c3.ts', code);
  const vars = findLocaleVarNames(sf, 'locale');
  assert.deepEqual(vars.sort(), ['i18n', 't']);
});

test('findLocaleVarNames from object spreads', () => {
  const code = `class C { m = { ...this.locale.get('home'), ...this.t.app }; t = this.locale.getLocale(); constructor(private locale: I18nLocaleService) {} }`;
  const sf = createSourceFile('c4.ts', code);
  const vars = findLocaleVarNames(sf, 'locale');
  assert.ok(vars.includes('m'));
});

test('findLocaleVarNames from method returning getLocale', () => {
  const code = `class C { constructor(private locale: I18nLocaleService) {} getT(){ return this.locale.getLocale(); } }`;
  const sf = createSourceFile('c5.ts', code);
  const vars = findLocaleVarNames(sf, 'locale');
  assert.ok(vars.includes('getT'));
});

test('collectVarRootOrder collects roots order', () => {
  const code = `class C { m = { ...this.locale.get('home'), ...this.t.app, ...this.locale.get('app') }; t = this.locale.getLocale(); constructor(private locale: I18nLocaleService) {} }`;
  const sf = createSourceFile('c6.ts', code);
  const vars = findLocaleVarNames(sf, 'locale');
  const order = collectVarRootOrder(sf, 'locale', vars);
  const roots = order.get('m') || [];
  assert.deepEqual(roots, ['home', 'app', 'app']);
});

test('collectTemplateKeys extracts keys from html', () => {
  const html = `{{ t.home.title }} <span>{{ t.app.name }}</span> {{ m.profile }}</span>`;
  const keys = collectTemplateKeys(html, ['t', 'm']);
  assert.ok(keys.includes('home.title'));
  assert.ok(keys.includes('app.name'));
  assert.ok(keys.includes('profile'));
});

test('resolveKeyFromContext returns exact with dot', () => {
  const k = resolveKeyFromContext('home.title', []);
  assert.equal(k, 'home.title');
});

test('resolveKeyFromContext unique suffix', () => {
  const k = resolveKeyFromContext('title', ['home.title']);
  assert.equal(k, 'home.title');
});

test('resolveKeyFromContext prefer app prefix', () => {
  const k = resolveKeyFromContext('name', ['home.name', 'app.name']);
  assert.equal(k, 'app.name');
});

test('flatten produces dot keys', () => {
  const obj = { a: { b: { c: 'x' } }, d: 'y' };
  const f = flatten(obj);
  assert.equal(f['a.b.c'], 'x');
  assert.equal(f['d'], 'y');
});

test('resolveKey with packKeys', () => {
  const pack = new Set(['home.title', 'app.name']);
  assert.equal(resolveKey('home.title', pack), 'home.title');
  assert.equal(resolveKey('name', pack), 'app.name');
  assert.equal(resolveKey('x', pack), 'x');
});

test('configurable serviceTypeName and getLocaleMethod', () => {
  const prev = {
    serviceTypeName: i18nAstConfig.serviceTypeName,
    getLocaleMethod: i18nAstConfig.getLocaleMethod,
    getMethod: i18nAstConfig.getMethod,
  };
  i18nAstConfig.serviceTypeName = 'MyLocaleService';
  i18nAstConfig.getLocaleMethod = 'getLang';
  i18nAstConfig.getMethod = 'getMsg';
  try {
    const code = `class C { t = this.locale.getLang(); m = { ...this.locale.getMsg('home') }; constructor(private locale: MyLocaleService) {} }`;
    const sf = createSourceFile('c7.ts', code);
    const name = findServiceParamName(sf);
    assert.equal(name, 'locale');
    const vars = findLocaleVarNames(sf, 'locale');
    assert.ok(vars.includes('t'));
    const order = collectVarRootOrder(sf, 'locale', ['m', 't']);
    const roots = order.get('m') || [];
    assert.deepEqual(roots, ['home']);
  } finally {
    i18nAstConfig.serviceTypeName = prev.serviceTypeName;
    i18nAstConfig.getLocaleMethod = prev.getLocaleMethod;
    i18nAstConfig.getMethod = prev.getMethod;
  }
});

test('collectTemplateKeys alias L with replace chain', () => {
  const html = `{{ L.app.title }} {{ L.templates.info.replace('{name}', '张三').replace('{count}', '3') }} {{ L.user.greetTpl.replace('{name}', '李四') }}`;
  const keys = collectTemplateKeys(html, ['L']);
  assert.ok(keys.includes('app.title'));
  assert.ok(keys.includes('templates.info.replace'));
  assert.ok(keys.includes('user.greetTpl.replace'));
});

test('collectTemplateKeys i18n variable with list and template', () => {
  const html = `{{ i18n.app.title }} {{ i18n.app.description }} {{ i18n.home.welcome }} {{ i18n.templates.itemTpl.replace('{index}', i).replace('{value}', it) }} {{ i18n.list.items }}`;
  const keys = collectTemplateKeys(html, ['i18n']);
  assert.ok(keys.includes('app.title'));
  assert.ok(keys.includes('app.description'));
  assert.ok(keys.includes('home.welcome'));
  assert.ok(keys.includes('templates.itemTpl.replace'));
  assert.ok(keys.includes('list.items'));
});

test('findLocaleVarNames detects dict assigned in constructor', () => {
  const code = `class C { dict: any; constructor(private locale: I18nLocaleService) { this.dict = this.locale.getLocale(); } }`;
  const sf = createSourceFile('c8.ts', code);
  const vars = findLocaleVarNames(sf, 'locale');
  assert.ok(vars.includes('dict'));
});

test('collectVarRootOrder for constructor spreads with service and var', () => {
  const code = `class C { t = this.locale.getLocale(); m: any; constructor(private locale: I18nLocaleService) { this.m = { ...this.locale.get('home'), ...this.t.app, ...this.locale.get('app') } } }`;
  const sf = createSourceFile('c9.ts', code);
  const vars = findLocaleVarNames(sf, 'locale');
  const order = collectVarRootOrder(sf, 'locale', vars);
  const roots = order.get('m') || [];
  assert.deepEqual(roots, ['home', 'app', 'app']);
});

test('resolveKeyFromContext with single candidate prefers app', () => {
  const k = resolveKeyFromContext('switchToZh', ['app.switchToZh']);
  assert.equal(k, 'app.switchToZh');
});

test('flatten handles arrays', () => {
  const obj = { list: { items: ['项目一', '项目二'] } };
  const f = flatten(obj);
  assert.equal(f['list.items.0'], '项目一');
  assert.equal(f['list.items.1'], '项目二');
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
  assert.equal(resolveKey('title', pack), 'app.title');
  assert.equal(resolveKey('description', pack), 'app.description');
  assert.equal(resolveKey('welcome', pack), 'home.welcome');
  assert.equal(resolveKey('info', pack), 'templates.info');
  assert.equal(resolveKey('greetTpl', pack), 'user.greetTpl');
});

test('collectVarRefUsages positions and paths', () => {
  const code = `class C { t = this.locale.getLocale(); constructor(private locale: I18nLocaleService) { const x = this.t.app.title } }`;
  const sf = createSourceFile('r5.ts', code);
  const vars = findLocaleVarNames(sf, 'locale');
  const usages = collectVarRefUsages(sf, 'r5.ts', 'locale', vars);
  const paths = usages.map(u => u.keyPath);
  assert.ok(paths.includes('app.title'));
  assert.ok(usages[0].range.start > 0);
});

test('collectVarRefUsages dynamic element access', () => {
  const code = `class C { t = this.locale.getLocale(); constructor(private locale: I18nLocaleService) { const x = this.t.app[key] } }`;
  const sf = createSourceFile('r6.ts', code);
  const vars = findLocaleVarNames(sf, 'locale');
  const usages = collectVarRefUsages(sf, 'r6.ts', 'locale', vars);
  const u = usages.find(u => u.rootVar === 't');
  assert.ok(u);
  assert.equal(u.keyPath, 'app');
  assert.ok(u.dynamicSegments && u.dynamicSegments.includes('key'));
});

test('collectVarRefUsages element literal becomes static path', () => {
  const code = `class C { t = this.locale.getLocale(); constructor(private locale: I18nLocaleService) { const x = this.t.app['title'] } }`;
  const sf = createSourceFile('r7.ts', code);
  const vars = findLocaleVarNames(sf, 'locale');
  const usages = collectVarRefUsages(sf, 'r7.ts', 'locale', vars);
  const paths = usages.map(u => u.keyPath);
  assert.ok(paths.includes('app.title'));
});

test('collectAngularTemplateUsages inline template simple', () => {
  const code = `@Component({ template: "{{ i18n.app.title }}" }) export class C { i18n = this.locale.getLocale(); constructor(public locale: I18nLocaleService) {} }`;
  const sf = createSourceFile('cmp.ts', code);
  const tUsages = collectAngularTemplateUsages(sf, 'cmp.ts', ['i18n']);
  assert.ok(tUsages.some(u => u.keyPath === 'app.title'));
});

test('collectAngularTemplateUsages inline template dynamic index', () => {
  const code = `@Component({ template: "{{ i18n.app[key] }}" }) export class C { i18n = this.locale.getLocale(); key = 'title'; constructor(public locale: I18nLocaleService) {} }`;
  const sf = createSourceFile('cmp3.ts', code);
  const tUsages = collectAngularTemplateUsages(sf, 'cmp3.ts', ['i18n']);
  const u = tUsages.find(u => u.varName === 'i18n');
  assert.ok(u);
  assert.equal(u.keyPath, 'app');
  assert.ok(u.dynamicSegments && u.dynamicSegments.includes('key'));
});

test('collectI18nUsageReport aggregates ts and templates', () => {
  const code = `@Component({ template: "{{ dict.home.welcome }}" }) export class C { dict: any; constructor(private locale: I18nLocaleService){ this.dict = this.locale.getLocale(); const z = this.dict.app.title } }`;
  const sf = createSourceFile('cmp2.ts', code);
  const report = collectI18nUsageReport(sf, 'cmp2.ts');
  assert.ok(report.tsUsages.some(u => u.keyPath === 'app.title'));
  assert.ok(report.templateUsages.some(u => u.keyPath === 'home.welcome'));
});

test('collectVarRefsRecursive simple root var chain', () => {
  const code = `class C { t = this.locale.getLocale(); constructor(private locale: I18nLocaleService) { const a = this.t.app; const b = a.title; const x = this.t.app.title; } }`;
  const sf = createSourceFile('r1.ts', code);
  const vars = findLocaleVarNames(sf, 'locale');
  const refs = collectVarRefsRecursive(sf, 'locale', vars);
  const set = Array.from(refs.get('t') || []).sort();
  assert.ok(set.includes('app'));
  assert.ok(set.includes('app.title'));
});

test('collectVarRefsRecursive constructor alias chain', () => {
  const code = `class C { i18n: any; constructor(private locale: I18nLocaleService) { const local = this.locale.getLocale().app; this.i18n = local; const t = this.i18n.title; } }`;
  const sf = createSourceFile('r2.ts', code);
  const vars = findLocaleVarNames(sf, 'locale');
  const refs = collectVarRefsRecursive(sf, 'locale', vars.concat(['i18n']));
  const set = Array.from(refs.get('i18n') || []).sort();
  assert.ok(set.includes('app.title'));
});

test('collectVarRefsRecursive spreads', () => {
  const code = `class C { t = this.locale.getLocale(); m = { ...this.t.app }; constructor(private locale: I18nLocaleService) { } }`;
  const sf = createSourceFile('r3.ts', code);
  const vars = findLocaleVarNames(sf, 'locale');
  const refs = collectVarRefsRecursive(sf, 'locale', vars);
  const set = Array.from(refs.get('t') || []).sort();
  assert.ok(set.includes('app'));
});

test('collectVarRefsRecursive dict and template', () => {
  const code = `class C { dict: any; constructor(private locale: I18nLocaleService) { this.dict = this.locale.getLocale(); const s = this.dict.templates.info; } }`;
  const sf = createSourceFile('r4.ts', code);
  const vars = findLocaleVarNames(sf, 'locale');
  const refs = collectVarRefsRecursive(sf, 'locale', vars);
  const set = Array.from(refs.get('dict') || []).sort();
  assert.ok(set.includes('templates.info'));
});
