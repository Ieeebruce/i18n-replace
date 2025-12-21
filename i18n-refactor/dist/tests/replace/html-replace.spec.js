"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const html_replace_1 = require("../../src/replace/html-replace");
test('render html pipe without params', () => {
    const s = (0, html_replace_1.renderHtmlPipe)({ varName: 'i18n', keyExpr: 'app.title' });
    expect(s).toBe("{{ 'app.title' | i18n }}");
});
test('render html pipe with params', () => {
    const s = (0, html_replace_1.renderHtmlPipe)({ varName: 'i18n', keyExpr: 'templates.info', params: { name: 'n', count: 'c' } });
    expect(s).toBe("{{ 'templates.info' | i18n: {\"name\":\"n\",\"count\":\"c\"} }}");
});
