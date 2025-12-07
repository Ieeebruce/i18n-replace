import { processComponent } from '../../src/runner/component'

test('basic: L alias with simple property', () => {
  const ts = `class C { 
  L: any;
  constructor(private locale: I18nLocaleService) { 
    this.L = this.locale.getLocale() 
  } 
  ngOnInit() { 
    console.log(this.L.app.title) 
  } 
}`
  const html = `<h1>{{ L.app.title }}</h1>`
  const out = processComponent(ts, html)
  expect(out.tsOut).toContain(`this.i18n.get('app.title')`)
  expect(out.htmlOut).toContain(`{{ 'app.title' | i18n }}`)
})

test('basic: L alias with simple property', () => {
  const ts = `class C { 
  L: any;
  constructor(private locale: I18nLocaleService) { 
    this.L = this.locale.getLocale().app
  } 
  ngOnInit() { 
    console.log(this.L.title) 
  } 
}`
  const html = `<h1>{{ L.title }}</h1>`
  const out = processComponent(ts, html)
  expect(out.tsOut).toContain(`this.i18n.get('app.title')`)
  expect(out.htmlOut).toContain(`{{ 'app.title' | i18n }}`)
})

test('basic: L alias with simple property', () => {
  const ts = `class C { 
  L: any;
  constructor(private locale: I18nLocaleService) { 
    this.L = this.locale.getLocale().app.common
  } 
  ngOnInit() { 
    console.log(this.L.desc) 
  } 
}`
  const html = `<h1>{{ L.desc }}</h1>`
  const out = processComponent(ts, html)
  console.log(out.tsOut)
  console.log(out.htmlOut)
  expect(out.tsOut).toContain(`this.i18n.get('app.common.desc')`)
  expect(out.htmlOut).toContain(`{{ 'app.common.desc' | i18n }}`)
})
