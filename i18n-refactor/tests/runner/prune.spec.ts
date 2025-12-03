import { processComponent } from '../../src/runner/component'

test('prune getLocale assignments and any declarations', () => {
  const ts = `class C { local: any; i18n: any; constructor(private locale: I18nLocaleService){ this.local = this.locale.getLocale(); this.i18n = this.locale.getLocale().app.common } m(){ return this.i18n.app.title } }`
  const html = `<div>{{ i18n.app.title }}</div>`
  const out = processComponent(ts, html)
  expect(out.tsOut).not.toMatch(/local\s*:\s*any\s*;/)
  expect(out.tsOut).not.toMatch(/this\.i18n\s*=\s*[^;]*getLocale/)
  expect(out.tsOut).toContain(`this.i18n.get('app.common.title')`)
  expect(out.htmlOut).toContain(`{{ 'app.title' | i18n }}`)
})
