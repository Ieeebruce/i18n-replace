"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const component_1 = require("../../src/runner/component");
test('basic: L alias with simple property', () => {
    const ts = `class C { L: any; constructor(private locale: I18nLocaleService){ this.L = this.locale.getLocale() } ngOnInit(){ console.log(this.L.app.title) } }`;
    const html = `<h1>{{ L.app.title }}</h1>`;
    const out = (0, component_1.processComponent)(ts, html);
    expect(out.tsOut).toContain(`this.i18n.get('app.title')`);
    expect(out.htmlOut).toContain(`{{ 'app.title' | i18n }}`);
});
