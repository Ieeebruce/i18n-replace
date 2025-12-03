"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const component_1 = require("../../src/runner/component");
test('multiple aliases i18n/dict/L in one component', () => {
    const ts = `class C { i18n: any; dict: any; L: any; constructor(private locale: I18nLocaleService){ this.i18n = this.locale.getLocale(); this.dict = { ...this.locale.getLocale().common, ...this.locale.getLocale().app }; this.L = this.locale.getLocale() } run(){ console.log(this.i18n.app.title); console.log(this.dict.common.desc); console.log(this.L.app.footer) } }`;
    const html = `<div>{{ i18n.app.title }}</div><div>{{ dict.common.desc }}</div><div>{{ L.app.footer }}</div>`;
    const out = (0, component_1.processComponent)(ts, html);
    expect(out.tsOut).toContain(`this.i18n.get('app.title')`);
    expect(out.tsOut).toContain(`this.i18n.get('app.common.desc')`);
    expect(out.tsOut).toContain(`this.i18n.get('app.footer')`);
    expect(out.htmlOut).toContain(`{{ 'app.title' | i18n }}`);
    expect(out.htmlOut).toContain(`{{ 'app.common.desc' | i18n }}`);
    expect(out.htmlOut).toContain(`{{ 'app.footer' | i18n }}`);
});
test('multiple aliases i18n/dict/L in one component', () => {
    const ts = `class C { i18n: any; dict: any; L: any; constructor(private locale: I18nLocaleService){ this.i18n = this.locale.getLocale(); this.dict = { ...this.locale.getLocale().app, ...this.locale.getLocale().common }; this.L = this.locale.getLocale() } run(){ console.log(this.i18n.app.title); console.log(this.dict.common.desc); console.log(this.L.app.footer) } }`;
    const html = `<div>{{ i18n.app.title }}</div><div>{{ dict.common.desc }}</div><div>{{ L.app.footer }}</div>`;
    const out = (0, component_1.processComponent)(ts, html);
    expect(out.tsOut).toContain(`this.i18n.get('app.title')`);
    expect(out.tsOut).toContain(`this.i18n.get('common.common.desc')`);
    expect(out.tsOut).toContain(`this.i18n.get('app.footer')`);
    expect(out.htmlOut).toContain(`{{ 'app.title' | i18n }}`);
    expect(out.htmlOut).toContain(`{{ 'common.common.desc' | i18n }}`);
    expect(out.htmlOut).toContain(`{{ 'app.footer' | i18n }}`);
});
