"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderTsGet = void 0;
function renderTsGet(aliasName, res) {
    const p = res.params && Object.keys(res.params).length ? `, ${JSON.stringify(res.params)}` : ''; // 参数对象拼接
    const k = (/^['"]/).test(res.keyExpr) || res.keyExpr.includes('+') ? res.keyExpr : `'${res.keyExpr}'`; // 键表达式处理（字面量或拼接）
    return `this.${aliasName}.get(${k}${p})`; // 生成最终调用字符串
}
exports.renderTsGet = renderTsGet;
