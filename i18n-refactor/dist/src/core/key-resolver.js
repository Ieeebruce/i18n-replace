"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveKeyFromAccess = void 0;
const typescript_1 = __importDefault(require("typescript"));
const dict_reader_1 = require("../util/dict-reader");
/**
 * 从 TypeScript 源码中的访问表达式（如 obj.a.b 或 obj['key']）解析出国际化键（i18n key）。
 * @param sf - 当前源文件，用于打印节点文本
 * @param node - 起始访问表达式节点
 * @param aliasPrefix - 用户手动指定的前缀（可为空）
 * @param roots - 可选的根路径列表，用于自动挑选最匹配的前缀
 * @returns 解析结果，包含最终生成的 keyExpr 与动态片段数组
 */
function resolveKeyFromAccess(sf, node, aliasPrefix, roots) {
    const segs = [];
    const printer = typescript_1.default.createPrinter();
    let cur = node;
    while (true) {
        if (typescript_1.default.isPropertyAccessExpression(cur)) {
            if (cur.expression.kind === typescript_1.default.SyntaxKind.ThisKeyword)
                break;
            const nm = cur.name.text;
            segs.push({ kind: 'prop', text: nm });
            cur = cur.expression;
            continue;
        }
        if (typescript_1.default.isElementAccessExpression(cur)) {
            const arg = cur.argumentExpression;
            if (typescript_1.default.isStringLiteral(arg))
                segs.push({ kind: 'lit', text: arg.text });
            else
                segs.push({ kind: 'dyn', text: printer.printNode(typescript_1.default.EmitHint.Unspecified, arg, sf) });
            cur = cur.expression;
            continue;
        }
        break;
    }
    segs.reverse();
    const staticParts = [];
    const dynamics = [];
    let dynamicSeen = false;
    for (const s of segs) {
        if (s.kind === 'dyn') {
            dynamics.push(s.text);
            dynamicSeen = true;
            break;
        }
        staticParts.push(s.text);
    }
    let prefix = aliasPrefix && aliasPrefix.length ? aliasPrefix : '';
    if (!prefix && roots && roots.length) {
        const r = (0, dict_reader_1.pickRoot)(roots, staticParts.join('.'));
        if (r)
            prefix = r;
    }
    const staticPath = [prefix, ...staticParts].filter(Boolean).join('.');
    let keyExpr = staticPath;
    if (dynamicSeen) {
        const lastDyn = dynamics[0];
        keyExpr = `'${staticPath}.' + ${lastDyn}`;
    }
    if (!staticParts.length && !dynamicSeen) {
        const txt = node.getText(sf).replace(/^this\./, '');
        const remainder = txt.replace(/^[A-Za-z_]\w*\./, '');
        let basePath = remainder;
        if (/\[[^\]]+\]$/.test(remainder)) {
            const m = remainder.match(/^(.*)\[(['"])([^'\"]+)\2\]$/);
            if (m)
                keyExpr = [prefix, m[1], m[3]].filter(Boolean).join('.');
            else {
                const md = remainder.match(/^(.*)\[([^\]]+)\]$/);
                if (md)
                    keyExpr = `'${[prefix, md[1]].filter(Boolean).join('.')}.' + ${md[2]}`;
            }
        }
        else {
            keyExpr = [prefix, basePath].filter(Boolean).join('.');
        }
    }
    return { keyExpr, dynamicSegments: dynamics.length ? dynamics : undefined };
}
exports.resolveKeyFromAccess = resolveKeyFromAccess;
