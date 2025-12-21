import { processComponent } from '../../src/runner/component';
import { config } from '../../src/core/config';

test('basic: L alias with simple property', () => {
  const svc = config.serviceVariableName;
  const ts = `class C { 
  L: any;
  constructor(private ${svc}: I18nLocaleService) { 
    this.L = this.${svc}.getLocale() 
  } 
  ngOnInit() { 
    console.log(this.L.app.title) 
  } 
}`;
  const html = `<h1>{{ L.app.title }}</h1>`;
  const out = processComponent(ts, html);
  expect(out.tsOut).toContain(`this.${svc}.get('app.title')`);
  expect(out.htmlOut).toContain(`{{ 'app.title' | i18n }}`);
});

test('basic: L alias with simple property (nested)', () => {
  const svc = config.serviceVariableName;
  const ts = `class C { 
  L: any;
  constructor(private ${svc}: I18nLocaleService) { 
    this.L = this.${svc}.getLocale().app
  } 
  ngOnInit() { 
    console.log(this.L.title) 
  } 
}`;
  const html = `<h1>{{ L.title }}</h1>`;
  const out = processComponent(ts, html);
  expect(out.tsOut).toContain(`this.${svc}.get('app.title')`);
  expect(out.htmlOut).toContain(`{{ 'app.title' | i18n }}`);
});

test('basic: L alias with simple property (deep nested)', () => {
  const svc = config.serviceVariableName;
  const ts = `class C { 
  L: any;
  constructor(private ${svc}: I18nLocaleService) { 
    this.L = this.${svc}.getLocale().app.common
  } 
  ngOnInit() { 
    console.log(this.L.desc) 
  } 
}`;
  const html = `<h1>{{ L.desc }}</h1>`;
  const out = processComponent(ts, html);
  console.log(out.tsOut);
  console.log(out.htmlOut);
  expect(out.tsOut).toContain(`this.${svc}.get('app.common.desc')`);
  expect(out.htmlOut).toContain(`{{ 'app.common.desc' | i18n }}`);
});

test('不要删除有使用的变量', () => {
  const svc = config.serviceVariableName;
  const ts = `export class AliasGetterComponent {
  L = this.${svc}.getLocale();
  title: string;
  title2: string;
  constructor(public ${svc}: I18nLocaleService) {
    this.title = this.L.home.welcome
    this.app = this.${svc}.getLocale().app
    this.title2 = this.${svc}.getLocale().app.title
  }
}`;
  const html = `<section style="padding:1rem">
  <h2>{{ L.app.title }}</h2>
  <h2>{{ title }}</h2>
  <p>{{ L.app.description }}</p>
  <p>{{ L.templates.info.replace('{name}', '李四').replace('{count}', '2') }}</p>
</section>`;
  const out = processComponent(ts, html);
  console.log(out.tsOut);
  console.log(out.htmlOut);
  expect(out.tsOut).toContain(`this.${svc}.get('home.welcome')`);
  expect(out.tsOut).toContain(`this.${svc}.get('app.title')`);
  expect(out.tsOut).toContain(`title: string;`);
  expect(out.tsOut).toContain(`title2: string;`);
  // L的初始化语句应该被删除
  expect(out.tsOut).not.toContain(`this.L = this.${svc}.getLocale()`);
  expect(out.htmlOut).toContain(`{{ 'app.title' | i18n }}`);
});

test('不要删除有使用的变量2', () => {
  const ts = `export class TodolistComponent {
  i18n: any
  items: TodoItem[] = []
  input = ''
  filter: 'all' | 'active' | 'completed' = 'all'
  nextId = 1
  title: any;
constructor(private locale: I18nLocaleService) {
  this.i18n = this.locale.getLocale();
  this.title = this.i18n.app.title
}
}`;
  const html = ``;
  const out = processComponent(ts, html);
  console.log(out.tsOut);
  console.log(out.htmlOut);
  expect(out.tsOut).toContain(`this.locale.get('app.title')`);
  expect(out.tsOut).toContain(`title: any;`);
});
