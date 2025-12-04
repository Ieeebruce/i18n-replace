"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveKeyFromAccess = void 0;
const typescript_1 = __importDefault(require("typescript")); // 引入 TypeScript，用于 AST 解析与打印
function resolveKeyFromAccess(sf, node, aliasPrefix, roots) {
    const segs = []; // 收集的片段：属性/字面量/动态
    const printer = typescript_1.default.createPrinter(); // 创建打印器，用于还原表达式文本
    let cur = node; // 当前遍历节点
    while (true) { // 顺链回溯
        if (typescript_1.default.isPropertyAccessExpression(cur)) { // 属性访问 a.b
            if (cur.expression.kind === typescript_1.default.SyntaxKind.ThisKeyword)
                break; // 到达 this.<alias> 停止
            const nm = cur.name.text; // 记录属性名
            segs.push({ kind: 'prop', text: nm }); // 存入片段
            cur = cur.expression; // 上溯
            continue; // 下一轮
        }
        if (typescript_1.default.isElementAccessExpression(cur)) { // 索引访问 a['x'] 或 a[idx]
            const arg = cur.argumentExpression; // 获取索引表达式
            if (typescript_1.default.isStringLiteral(arg))
                segs.push({ kind: 'lit', text: arg.text }); // 字面量索引
            else
                segs.push({ kind: 'dyn', text: printer.printNode(typescript_1.default.EmitHint.Unspecified, arg, sf) }); // 动态索引表达式文本
            cur = cur.expression; // 上溯
            continue; // 继续捕获前置属性，遇到别名停止
        }
        break; // 不是属性/索引访问则结束
    }
    segs.reverse(); // 反转得到自左到右顺序
    const prefix = aliasPrefix && aliasPrefix.length ? aliasPrefix : (roots && roots.length ? roots[0] : ''); // 前缀：别名路径或根
    const staticParts = []; // 静态片段集合
    const dynamics = []; // 动态片段集合
    let dynamicSeen = false; // 是否遇到动态
    for (const s of segs) { // 收集直到动态为止
        if (s.kind === 'dyn') {
            dynamics.push(s.text);
            dynamicSeen = true;
            break;
        } // 记录首个动态并停止
        staticParts.push(s.text); // 记录静态片段
    }
    const staticPath = [prefix, ...staticParts].filter(Boolean).join('.'); // 拼静态路径
    let keyExpr = staticPath; // 初始键表达式
    if (dynamicSeen) { // 有动态索引时，拼接成字符串加表达式
        const lastDyn = dynamics[0]; // 首个动态片段
        keyExpr = `'${staticPath}.' + ${lastDyn}`; // 静态 + '.' + 动态
    }
    if (!staticParts.length && !dynamicSeen) { // 只有别名本身：从原文本兜底解析
        const txt = node.getText(sf).replace(/^this\./, ''); // 去掉 this.
        const remainder = txt.replace(/^[A-Za-z_]\w*\./, ''); // 去掉别名
        if (/\[[^\]]+\]$/.test(remainder)) { // 末尾为索引访问
            const m = remainder.match(/^(.*)\[(['"])([^'\"]+)\2\]$/); // 字面量索引
            if (m)
                keyExpr = [prefix, m[1], m[3]].filter(Boolean).join('.'); // 拼字面量索引
            else {
                const md = remainder.match(/^(.*)\[([^\]]+)\]$/); // 动态索引
                if (md)
                    keyExpr = `'${[prefix, md[1]].filter(Boolean).join('.')}.' + ${md[2]}`; // 拼动态索引
            }
        }
        else {
            keyExpr = [prefix, remainder].filter(Boolean).join('.'); // 普通属性拼接
        }
    }
    return { keyExpr, dynamicSegments: dynamics.length ? dynamics : undefined }; // 返回解析结果
}
exports.resolveKeyFromAccess = resolveKeyFromAccess;
