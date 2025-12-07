"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderHtmlPipe = void 0;
function renderHtmlPipe(use) {
    const p = use.params && Object.keys(use.params).length ? `: ${JSON.stringify(use.params)}` : ''; // 构建参数部分
    const k = use.keyExpr; // 键表达式
    if (/\+/.test(k) || /^\(/.test(k) || /^'\(/.test(k))
        return `{{ (${k}) | i18n${p} }}`;
    return `{{ '${k}' | i18n${p} }}`; // 返回插值字符串
}
exports.renderHtmlPipe = renderHtmlPipe;
