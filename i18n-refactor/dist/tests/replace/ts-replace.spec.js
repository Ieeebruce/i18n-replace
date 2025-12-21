"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ts_replace_1 = require("../../src/replace/ts-replace");
test('render ts get without params', () => {
    const s = (0, ts_replace_1.renderTsGet)('i18n', { keyExpr: 'app.title' });
    expect(s).toBe("this.i18n.get('app.title')");
});
test('render ts get with params', () => {
    const s = (0, ts_replace_1.renderTsGet)('i18n', { keyExpr: 'templates.info', params: { name: 'n', count: 'c' } });
    // ignore character escaping differences
    expect(s.replace(/\s/g, '')).toBe("this.i18n.get('templates.info', {name:n,count:c})".replace(/\s/g, ''));
});
