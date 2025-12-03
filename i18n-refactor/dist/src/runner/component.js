"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processComponent = void 0;
function processComponent(tsCode, htmlCode) {
    return { tsOut: tsCode, htmlOut: htmlCode }; // 当前直接返回原始内容，后续可接入替换能力
}
exports.processComponent = processComponent;
