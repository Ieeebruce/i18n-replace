"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const component_1 = require("../../src/runner/component");
test('dynamic index and params chain', () => {
    const ts = `class C { i18n: any; idx = 1; constructor(private locale: I18nLocaleService){ this.i18n = this.locale.getLocale() } run(){ console.log(this.i18n.list[this.idx]); console.log(this.i18n.templates.info.replace('{name}', user.name).replace('{count}', String(n))) } }`;
    const html = `{{ i18n.list[idx] }} \n {{ i18n.templates.info.replace('{name}', name).replace('{count}', count) }}`;
    const out = (0, component_1.processComponent)(ts, html);
    expect(out.tsOut).toContain(`this.i18n.get('list.' + this.idx)`); // TS 动态索引
    expect(out.tsOut).toContain(`this.i18n.get('templates.info', {\"name\":`); // TS 参数对象
    expect(out.htmlOut).toContain(`{{ ('list.' + idx) | i18n }}`);
    expect(out.htmlOut).toContain(`{{ 'templates.info' | i18n: {\"name\":`); // HTML 参数对象
});
