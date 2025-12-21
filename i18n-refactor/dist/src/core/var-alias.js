"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectVarAliases = void 0;
const typescript_1 = __importDefault(require("typescript")); // 引入 TypeScript AST 工具
function isGetLocalCall(sf, expr, serviceParamName, getLocalMethod) {
    if (!expr || !typescript_1.default.isCallExpression(expr))
        return false; // 不是调用表达式
    const ex = expr.expression; // 调用目标
    return typescript_1.default.isPropertyAccessExpression(ex) // 形如 a.b
        && ex.name.getText(sf) === getLocalMethod // 方法名为 getLocal
        && typescript_1.default.isPropertyAccessExpression(ex.expression) // 前缀为 this.<service>
        && ex.expression.expression.kind === typescript_1.default.SyntaxKind.ThisKeyword // 以 this 开始
        && typescript_1.default.isIdentifier(ex.expression.name) // 服务名为标识符
        && ex.expression.name.getText(sf) === serviceParamName; // 服务名匹配
}
function chainAfterGetLocal(sf, expr) {
    const segs = []; // 存储段
    let cur = expr; // 当前表达式
    while (typescript_1.default.isPropertyAccessExpression(cur)) { // 连续属性访问
        segs.push(cur.name.getText(sf)); // 记录属性名
        cur = cur.expression; // 上溯
    }
    return segs.reverse(); // 返回自左到右顺序
}
function collectVarAliases(sf, serviceParamName, getLocalMethod, externalAliases) {
    // console.log('collectVarAliases start', serviceParamName, getLocalMethod)
    const out = new Map(); // 存储结果映射
    function addAlias(name, declNode) {
        // console.log('addAlias', name)
        if (!out.has(name))
            out.set(name, { name, prefix: null, roots: [], declNode }); // 初始化
        const a = out.get(name);
        if (declNode && !a.declNode)
            a.declNode = declNode;
        return a; // 返回记录
    }
    function visit(node) {
        if (typescript_1.default.isPropertyDeclaration(node) && node.initializer) {
            if (typescript_1.default.isPropertyAccessExpression(node.initializer)) { // 属性初始化为访问表达式
                const base = node.initializer; // 基本表达式
                let cur = base; // 当前表达式
                while (typescript_1.default.isPropertyAccessExpression(cur))
                    cur = cur.expression; // 上溯到调用
                if (typescript_1.default.isCallExpression(cur) && isGetLocalCall(sf, cur, serviceParamName, getLocalMethod)) { // 是 getLocal 调用
                    const segs = chainAfterGetLocal(sf, base); // 提取链
                    if (node.name && typescript_1.default.isIdentifier(node.name)) { // 属性名标识符
                        const a = addAlias(node.name.getText(sf), node); // 别名记录
                        a.prefix = segs.join('.'); // 设置前缀
                    }
                }
            }
            else if (typescript_1.default.isCallExpression(node.initializer) && isGetLocalCall(sf, node.initializer, serviceParamName, getLocalMethod)) {
                if (node.name && typescript_1.default.isIdentifier(node.name)) {
                    const a = addAlias(node.name.getText(sf), node);
                    if (node.initializer.arguments.length > 0) {
                        const arg = node.initializer.arguments[0];
                        if (typescript_1.default.isStringLiteral(arg)) {
                            a.prefix = arg.text;
                        }
                    }
                }
            }
        }
        if (typescript_1.default.isPropertyDeclaration(node) && node.initializer && typescript_1.default.isObjectLiteralExpression(node.initializer) && node.name && typescript_1.default.isIdentifier(node.name)) { // 属性初始化为对象字面量
            const spreads = node.initializer.properties.filter(p => typescript_1.default.isSpreadAssignment(p)); // 收集展开项
            const roots = []; // 根来源集合
            for (const sp of spreads) { // 遍历展开
                const e = sp.expression; // 展开表达式
                if (typescript_1.default.isPropertyAccessExpression(e)) { // 属性访问
                    let cur = e; // 当前
                    while (typescript_1.default.isPropertyAccessExpression(cur))
                        cur = cur.expression; // 上溯
                    if (typescript_1.default.isCallExpression(cur) && isGetLocalCall(sf, cur, serviceParamName, getLocalMethod)) { // getLocal 来源
                        const segs = chainAfterGetLocal(sf, e); // 取链
                        if (segs.length)
                            roots.push(segs[0]); // 记录根段
                    }
                }
            }
            if (roots.length) { // 有根来源
                const a = addAlias(node.name.getText(sf), node); // 别名记录
                a.roots = roots; // 设置根顺序
            }
        }
        if (typescript_1.default.isConstructorDeclaration(node)) { // 构造函数赋值
            const paramTypes = new Map();
            for (const p of node.parameters) {
                if (typescript_1.default.isIdentifier(p.name) && p.type && typescript_1.default.isTypeReferenceNode(p.type) && typescript_1.default.isIdentifier(p.type.typeName)) {
                    paramTypes.set(p.name.text, p.type.typeName.text);
                }
            }
            for (const s of node.body ? node.body.statements : []) { // 遍历语句
                if (typescript_1.default.isExpressionStatement(s) && typescript_1.default.isBinaryExpression(s.expression)) { // 赋值表达式
                    const be = s.expression; // 二元表达式
                    if (be.operatorToken.kind === typescript_1.default.SyntaxKind.EqualsToken && typescript_1.default.isPropertyAccessExpression(be.left)) { // 左侧为属性访问
                        const left = be.left; // 左侧表达式
                        if (left.expression.kind === typescript_1.default.SyntaxKind.ThisKeyword && typescript_1.default.isIdentifier(left.name)) { // this.<name>
                            const nm = left.name.getText(sf); // 名称
                            if (typescript_1.default.isPropertyAccessExpression(be.right)) { // 右侧为属性访问链
                                const base = be.right; // 右侧表达式
                                let cur = base; // 当前
                                while (typescript_1.default.isPropertyAccessExpression(cur))
                                    cur = cur.expression; // 上溯
                                if (typescript_1.default.isCallExpression(cur) && isGetLocalCall(sf, cur, serviceParamName, getLocalMethod)) { // getLocal 调用
                                    const segs = chainAfterGetLocal(sf, base); // 链
                                    const a = addAlias(nm, be); // 别名记录
                                    a.prefix = segs.join('.'); // 设置前缀
                                }
                                else {
                                    let temp = base;
                                    while (typescript_1.default.isPropertyAccessExpression(temp)) {
                                        if (temp.expression.kind === typescript_1.default.SyntaxKind.ThisKeyword && typescript_1.default.isIdentifier(temp.name)) {
                                            const otherName = temp.name.getText(sf);
                                            if (out.has(otherName)) {
                                                const other = out.get(otherName);
                                                const segs = chainAfterGetLocal(sf, base);
                                                if (segs.length && segs[0] === otherName)
                                                    segs.shift();
                                                const a = addAlias(nm, be);
                                                if (other.prefix)
                                                    a.prefix = [other.prefix, ...segs].join('.');
                                                else
                                                    a.prefix = segs.join('.');
                                                if (other.roots)
                                                    a.roots = other.roots;
                                                break;
                                            }
                                            else if (externalAliases && paramTypes.has(otherName)) {
                                                const typeName = paramTypes.get(otherName);
                                                console.log('[DEBUG] Checking external alias', otherName, typeName);
                                                const exList = externalAliases.get(typeName);
                                                if (exList) {
                                                    console.log('[DEBUG] Found external aliases for', typeName, exList);
                                                    const path = [];
                                                    let curr = base;
                                                    let valid = true;
                                                    while (curr !== temp) {
                                                        if (typescript_1.default.isPropertyAccessExpression(curr)) {
                                                            path.unshift(curr.name.getText(sf));
                                                            curr = curr.expression;
                                                        }
                                                        else {
                                                            valid = false;
                                                            break;
                                                        }
                                                    }
                                                    if (valid && path.length > 0) {
                                                        const aliasProp = path[0];
                                                        const target = exList.find(x => x.name === aliasProp);
                                                        if (target) {
                                                            console.log('[DEBUG] Match external alias', aliasProp, 'to', target);
                                                            path.shift();
                                                            const a = addAlias(nm, be);
                                                            if (target.prefix)
                                                                a.prefix = [target.prefix, ...path].join('.');
                                                            else
                                                                a.prefix = path.join('.');
                                                            if (target.roots)
                                                                a.roots = target.roots;
                                                            break;
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        temp = temp.expression;
                                    }
                                }
                            }
                            else if (typescript_1.default.isCallExpression(be.right) && isGetLocalCall(sf, be.right, serviceParamName, getLocalMethod)) {
                                const a = addAlias(nm);
                                if (be.right.arguments.length > 0) {
                                    const arg = be.right.arguments[0];
                                    if (typescript_1.default.isStringLiteral(arg)) {
                                        a.prefix = arg.text;
                                    }
                                }
                            }
                            if (typescript_1.default.isObjectLiteralExpression(be.right)) { // 右侧为对象字面量（合并）
                                const spreads = be.right.properties.filter(p => typescript_1.default.isSpreadAssignment(p)); // 展开项
                                const roots = []; // 根来源集合
                                for (const sp of spreads) { // 遍历展开
                                    const e = sp.expression; // 表达式
                                    if (typescript_1.default.isPropertyAccessExpression(e)) { // 属性访问
                                        let cur = e; // 当前
                                        while (typescript_1.default.isPropertyAccessExpression(cur))
                                            cur = cur.expression; // 上溯
                                        if (typescript_1.default.isCallExpression(cur) && isGetLocalCall(sf, cur, serviceParamName, getLocalMethod)) { // 来源判断
                                            const segs = chainAfterGetLocal(sf, e); // 链
                                            if (segs.length)
                                                roots.push(segs[0]); // 记录根段
                                        }
                                    }
                                }
                                if (roots.length) { // 有根来源
                                    const a = addAlias(nm); // 别名记录
                                    a.roots = roots; // 设置根顺序
                                }
                            }
                        }
                    }
                }
            }
        }
        typescript_1.default.forEachChild(node, visit); // 递归子节点
    }
    visit(sf); // 开始遍历
    return Array.from(out.values()); // 返回别名列表
}
exports.collectVarAliases = collectVarAliases;
