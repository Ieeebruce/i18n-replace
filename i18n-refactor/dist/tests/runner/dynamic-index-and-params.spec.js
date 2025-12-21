"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const component_1 = require("../../src/runner/component");
test('dynamic index and params chain', () => {
    const ts = `class C { i18n: any; idx = 1; constructor(private locale: I18nLocaleService){ this.i18n = this.locale.getLocale() } run(){ console.log(this.i18n.list[this.idx]); console.log(this.i18n.templates.info.replace('{name}', user.name).replace('{count}', String(n))) } }`;
    const html = `{{ i18n.list[idx] }} \n {{ i18n.templates.info.replace('{name}', name).replace('{count}', count) }}`;
    const out = (0, component_1.processComponent)(ts, html);
    expect(out.tsOut).toContain(`this.locale.get('list.' + this.idx)`); // TS 动态索引
    // ignore character escaping differences
    expect(out.tsOut.replace(/\s/g, '')).toContain(`this.locale.get('templates.info', {name:`.replace(/\s/g, '')); // TS 参数对象
    expect(out.htmlOut).toContain(`{{ ('list.' + idx) | i18n }}`);
    // ignore character escaping differences
    expect(out.htmlOut.replace(/\s/g, '')).toContain(`{{ 'templates.info' | i18n: {name:`.replace(/\s/g, '')); // HTML 参数对象
});
