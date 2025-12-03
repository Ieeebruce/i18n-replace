"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const component_1 = require("../../src/runner/component");
test('merge: dict alias from spreads common+app', () => {
    const ts = `class C { dict: any; constructor(private locale: I18nLocaleService){ this.dict = { ...this.locale.getLocale().common, ...this.locale.getLocale().app } } ng(){ console.log(this.dict.common.title); console.log(this.dict.app.desc) } }`;
    const html = `<p>{{ dict.common.title }}</p><p>{{ dict.app.desc }}</p>`;
    const out = (0, component_1.processComponent)(ts, html);
    expect(out.htmlOut.includes("{{ 'common.common.title' | i18n }}") ||
        out.htmlOut.includes("{{ 'app.common.title' | i18n }}")).toBe(true);
    expect(out.htmlOut.includes("{{ 'common.app.desc' | i18n }}") ||
        out.htmlOut.includes("{{ 'app.app.desc' | i18n }}")).toBe(true);
});
