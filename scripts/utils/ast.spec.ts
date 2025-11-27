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
  assert.equal(name, 'locale');
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
