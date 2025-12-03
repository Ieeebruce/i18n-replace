"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractReplaceParams = void 0;
function extractReplaceParams(chainText) {
    const out = {}; // 初始化输出对象
    const re = /\.replace\(\s*["']\{([^}]+)\}["']\s*,\s*([^)]+)\s*\)/g; // 正则匹配 .replace('{key}', expr)
    let m; // 临时匹配结果
    while ((m = re.exec(chainText))) { // 逐个匹配链中的所有 replace
        out[m[1]] = m[2].trim(); // 记录参数：key → expr
    }
    return out; // 返回参数对象
}
exports.extractReplaceParams = extractReplaceParams;
