"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectTemplateUsages = void 0;
function collectTemplateUsages(html, varNames) {
    const out = [];
    const vn = varNames.join('|');
    // 链式 replace：{{ var.key.replace('{a}', x).replace('{b}', y) }}
    const reReplace = new RegExp(`\\{\\{\\s*(${vn})\\.([A-Za-z0-9_.]+)((?:\\.replace\\([^)]*\\))+)[^}]*\\}\\}`, 'g');
    let m;
    while ((m = reReplace.exec(html))) {
        const varName = m[1];
        const base = m[2];
        const chain = m[3];
        const params = {};
        const rp = /\.replace\(\s*['"]\{([^}]+)\}['"]\s*,\s*([^\)]+)\s*\)/g;
        let mm;
        while ((mm = rp.exec(chain)))
            params[mm[1]] = mm[2].trim();
        const start = m.index;
        const raw = m[0];
        const end = start + raw.length;
        out.push({ varName, keyExpr: base, params, start, end, raw, kind: 'replace' });
    }
    // 字面量索引：{{ var.key['lit'] }} 或 {{ var.key["lit"] }}
    const reLit = new RegExp(`\\{\\{\\s*(${vn})\\.([A-Za-z0-9_.]+)\\s*\\[(['"])([^'\"]+)\\3\\]\\s*\\}\\}`, 'g');
    while ((m = reLit.exec(html))) {
        const varName = m[1];
        const base = m[2];
        const lit = m[4];
        const start = m.index;
        const raw = m[0];
        const end = start + raw.length;
        out.push({ varName, keyExpr: `${base}.${lit}`, start, end, raw, kind: 'lit' });
    }
    // 动态索引：{{ var.key[idx] }}
    const reDyn = new RegExp(`\\{\\{\\s*(${vn})\\.([A-Za-z0-9_.]+)\\s*\\[([^\\]]+)\\]\\s*\\}\\}`, 'g');
    while ((m = reDyn.exec(html))) {
        const varName = m[1];
        const base = m[2];
        const expr = m[3].trim();
        const start = m.index;
        const raw = m[0];
        const end = start + raw.length;
        out.push({ varName, keyExpr: `'${base}.' + ${expr}`, dynamicSegments: [expr], start, end, raw, kind: 'dyn' });
    }
    // 简单属性：{{ var.key }}
    const reProp = new RegExp(`\\{\\{\\s*(${vn})\\.([A-Za-z0-9_.]+)\\s*\\}\\}`, 'g');
    while ((m = reProp.exec(html))) {
        const start = m.index;
        const raw = m[0];
        const end = start + raw.length;
        out.push({ varName: m[1], keyExpr: m[2], start, end, raw, kind: 'prop' });
    }
    return out;
}
exports.collectTemplateUsages = collectTemplateUsages;
