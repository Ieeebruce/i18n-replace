"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pruneUnused = void 0;
function pruneUnused(sf, code, varNames) {
    let out = code; // 从原始代码复制开始
    for (const v of varNames) { // 遍历待清理的变量名
        const reAssign = new RegExp('this\\.' + v + '\\s*=\\s*[^;]*\\.' + '(?:getLocal|getLocale)' + '\\([^)]*\\)(?:\\.[A-Za-z0-9_.]+)?\\s*;', 'g');
        const reDeclTyped = new RegExp(`\\b${v}\\s*:\\s*[^;]+;`, 'g');
        const reDeclBare = new RegExp(`\\b${v}\\s*;`, 'g');
        out = out.replace(reAssign, ''); // 删除 getLocal 赋值语句
        out = out.replace(reDeclTyped, ''); // 删除带类型的声明
        out = out.replace(reDeclBare, ''); // 删除仅声明语句
        out = out.replace(new RegExp(`\\b${v}\\s*:\\s*any\\s*;`, 'g'), '');
    } // 结束变量遍历
    out = out.replace(/\\blocal\\s*:\\s*any\\s*;/g, '');
    out = out.replace(/this\\.[A-Za-z_]\\w*\\s*=\\s*[^;]*\\.(?:getLocal|getLocale)\\([^)]*\\)(?:\\.[A-Za-z0-9_.]+)?\\s*;?/g, '');
    return out; // 返回清理后的代码
} // 函数结束
exports.pruneUnused = pruneUnused;
