"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processComponent = void 0;
const typescript_1 = __importDefault(require("typescript")); // 引入 TypeScript AST 与类型
const path = __importStar(require("path"));
const config_1 = require("../core/config");
const var_alias_1 = require("../core/var-alias"); // 导入别名收集工具
const params_extractor_1 = require("../core/params-extractor"); // 导入 replace 参数抽取器
const ts_replace_1 = require("../replace/ts-replace"); // 导入 TS 调用渲染器
const dict_reader_1 = require("../util/dict-reader");
const key_resolver_1 = require("../core/key-resolver");
function collectGetLocaleVars(code) {
    const names = new Set(); // 结果集合
    const reA = /this\.([A-Za-z_]\w*)\s*=\s*[^;]*\.getLocale\([^)]*\)/g; // 匹配 getLocale 赋值
    const reB = /this\.([A-Za-z_]\w*)\s*=\s*[^;]*\.getLocal\([^)]*\)/g; // 匹配 getLocal 赋值
    let m; // 临时匹配
    while ((m = reA.exec(code)))
        names.add(m[1]); // 记录变量名
    while ((m = reB.exec(code)))
        names.add(m[1]); // 记录变量名
    return Array.from(names); // 返回集合
}
function buildAliases(code, externalAliases) {
    const sf = typescript_1.default.createSourceFile('x.ts', code, typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS); // 解析源码
    // Detect service name from constructor
    let serviceName = '';
    const visitCtor = (node) => {
        if (typescript_1.default.isConstructorDeclaration(node)) {
            for (const p of node.parameters) {
                if (p.type && typescript_1.default.isTypeReferenceNode(p.type) && typescript_1.default.isIdentifier(p.type.typeName) && p.type.typeName.text === config_1.config.serviceTypeName) {
                    if (typescript_1.default.isIdentifier(p.name))
                        serviceName = p.name.text;
                }
            }
        }
        typescript_1.default.forEachChild(node, visitCtor);
    };
    visitCtor(sf);
    const raw = (0, var_alias_1.collectVarAliases)(sf, serviceName, config_1.config.getLocalMethod, externalAliases); // 通过 AST 收集别名
    const regexVars = [];
    const allRoots = (0, dict_reader_1.getAllRoots)();
    const out = []; // 输出列表
    for (const a of raw) { // 转换结果结构
        // Check if the alias points to a leaf (value) or a branch (namespace)
        // If it points to a leaf (e.g. 'app.title' string), it is a value variable, not a helper alias.
        // We should NOT treat it as an alias (so we don't remove its assignment).
        let isLeaf = false;
        if (a.prefix) {
            if (a.roots && a.roots.length > 0) {
                for (const r of a.roots) {
                    if ((0, dict_reader_1.hasKey)(r, a.prefix)) {
                        isLeaf = true;
                        break;
                    }
                }
            }
            else {
                // Try to split prefix into root + path
                const parts = a.prefix.split('.');
                if (parts.length > 1 && allRoots.includes(parts[0])) {
                    const r = parts[0];
                    const p = parts.slice(1).join('.');
                    if ((0, dict_reader_1.hasKey)(r, p))
                        isLeaf = true;
                }
            }
        }
        if (isLeaf) {
            // Skip adding this as an alias
            continue;
        }
        let declRange;
        if (a.declNode && typescript_1.default.isBinaryExpression(a.declNode) && a.declNode.operatorToken.kind === typescript_1.default.SyntaxKind.EqualsToken) {
            if (typescript_1.default.isExpressionStatement(a.declNode.parent)) {
                const stmt = a.declNode.parent;
                declRange = { s: stmt.getStart(sf), e: stmt.getEnd() };
            }
        }
        out.push({ name: a.name, prefix: a.prefix, roots: a.roots, declRange }); // 推入别名
    }
    for (const name of regexVars)
        out.push({ name, prefix: null });
    // 不再将所有 this.<name>. 视为别名，避免误替换普通对象/数组方法
    // 去重：同名保留带前缀者
    const map = new Map(); // 名称到别名映射
    for (const a of out) { // 遍历候选
        const prev = map.get(a.name); // 已有
        if (!prev || (a.prefix && !prev.prefix))
            map.set(a.name, a); // 选择最佳
    }
    return { aliases: Array.from(map.values()), serviceName }; // 返回列表
}
function filterLeafAliases(tsCode, aliases) {
    const sf = typescript_1.default.createSourceFile('x.ts', tsCode, typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS);
    const usedAsAlias = new Set();
    const visit = (node) => {
        if (typescript_1.default.isPropertyAccessExpression(node)) {
            if (node.expression.kind === typescript_1.default.SyntaxKind.ThisKeyword && typescript_1.default.isIdentifier(node.name)) {
                const name = node.name.text;
                const p = node.parent;
                if ((typescript_1.default.isPropertyAccessExpression(p) && p.expression === node) ||
                    (typescript_1.default.isElementAccessExpression(p) && p.expression === node)) {
                    usedAsAlias.add(name);
                }
            }
        }
        typescript_1.default.forEachChild(node, visit);
    };
    visit(sf);
    const filtered = aliases.filter(a => usedAsAlias.has(a.name));
    return filtered;
}
function replaceTs(src, externalAliases) {
    let s = src;
    let { aliases, serviceName } = buildAliases(src, externalAliases);
    const replaceVar = serviceName || config_1.config.serviceVariableName;
    const sfAst = typescript_1.default.createSourceFile('x.ts', s, typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS);
    const reps = [];
    const seen = new Set();
    const info = new Map();
    for (const a of aliases)
        info.set(a.name, a);
    const printer = typescript_1.default.createPrinter();
    const handledRanges = [];
    const isHandled = (n) => {
        const s = n.getStart(sfAst);
        const e = n.getEnd();
        return handledRanges.some(r => s >= r.s && e <= r.e);
    };
    const getAliasName = (expr) => {
        let cur = expr;
        while (typescript_1.default.isPropertyAccessExpression(cur) || typescript_1.default.isElementAccessExpression(cur)) {
            if (typescript_1.default.isPropertyAccessExpression(cur) && cur.expression.kind === typescript_1.default.SyntaxKind.ThisKeyword && typescript_1.default.isIdentifier(cur.name)) {
                return cur.name.text;
            }
            cur = cur.expression;
        }
        return null;
    };
    const visitAst = (node) => {
        if (isHandled(node))
            return;
        if (typescript_1.default.isPropertyAccessExpression(node) || typescript_1.default.isElementAccessExpression(node)) {
            let outer = node;
            while ((typescript_1.default.isPropertyAccessExpression(outer.parent) && outer.parent.expression === outer) || (typescript_1.default.isElementAccessExpression(outer.parent) && outer.parent.expression === outer)) {
                outer = outer.parent;
            }
            const aliasName = getAliasName(outer);
            if (aliasName && info.has(aliasName)) {
                const ai = info.get(aliasName);
                const p = outer.parent;
                const isCall = typescript_1.default.isCallExpression(p) && p.expression === outer;
                const isAssignLHS = typescript_1.default.isBinaryExpression(p) && p.left === outer;
                const isReplaceChain = typescript_1.default.isPropertyAccessExpression(p) && p.name.getText(sfAst) === 'replace';
                // Additional check: if parent is assignment, ensure we are not replacing the LHS if it is the alias definition itself?
                // But here we are looking at USAGE.
                // If `this.i18n = this.exampleService.i18n`, `this.exampleService.i18n` is usage of `exampleService` alias?
                // No, `exampleService` is not an alias in `aliases` list usually (it's a service).
                // Unless `buildAliases` added it?
                // If `exampleService` is NOT in aliases, `getAliasName` returns null or `exampleService`.
                // If `info` has `exampleService`, then it enters here.
                // If `exampleService` is in `info`, then `this.exampleService.i18n` is a usage.
                // And it will be replaced by `this.i18n.get(...)`.
                // So `this.i18n = this.i18n.get(...)`. This is wrong.
                // We want to remove the assignment entirely.
                if (!isCall && !isAssignLHS && !isReplaceChain) {
                    // Check if this usage is the RHS of an alias definition that we are going to remove?
                    // If we are removing the assignment `this.i18n = ...`, we should NOT replace the RHS with `get(...)`.
                    // Because the whole statement will be removed.
                    const stmt = outer.parent;
                    let isInsideRemoval = false;
                    for (const a of aliases) {
                        if (a.declRange && stmt.getStart(sfAst) >= a.declRange.s && stmt.getEnd() <= a.declRange.e) {
                            isInsideRemoval = true;
                            break;
                        }
                    }
                    if (!isInsideRemoval) {
                        const res = (0, key_resolver_1.resolveKeyFromAccess)(sfAst, outer, ai.prefix || null, (ai.roots && ai.roots.length) ? ai.roots : (0, dict_reader_1.getAllRoots)());
                        const text = (0, ts_replace_1.renderTsGet)(replaceVar, res);
                        const key = `${outer.getStart(sfAst)}:${outer.getEnd()}`;
                        if (!seen.has(key)) {
                            reps.push({ s: outer.getStart(sfAst), e: outer.getEnd(), text });
                            seen.add(key);
                        }
                    }
                }
            }
        }
        if (typescript_1.default.isCallExpression(node) && typescript_1.default.isPropertyAccessExpression(node.expression) && node.expression.name.getText(sfAst) === 'get') {
            const base = node.expression.expression;
            const aliasName = getAliasName(base);
            if (aliasName && info.has(aliasName)) {
                const ai = info.get(aliasName);
                const arg0 = node.arguments[0];
                if (arg0 && typescript_1.default.isStringLiteral(arg0)) {
                    const roots = (ai.roots && ai.roots.length) ? ai.roots : (0, dict_reader_1.getAllRoots)();
                    const r = (0, dict_reader_1.pickRoot)(roots, arg0.text);
                    if (r) {
                        const newKey = `${r}.${arg0.text}`;
                        const text = `this.${replaceVar}.get('${newKey}')`; // simplistic replacement, ignoring other args for now
                        const key = `${node.getStart(sfAst)}:${node.getEnd()}`;
                        // check if we need to preserve other arguments? 
                        // get(key, params) -> get(newKey, params)
                        // simplified: only replace if key changes
                        if (newKey !== arg0.text) {
                            // We need to preserve other arguments if any.
                            // But renderTsGet usually reconstructs the call.
                            // Here we are editing an existing call.
                            // Easier to just replace the string literal content?
                            // But reps uses text replacement.
                            // Let's replace the whole call to be safe/consistent.
                            // Wait, renderTsGet generates `this.i18n.get(...)`.
                            // Does it support preserving other args? 
                            // resolveKeyFromAccess returns params? No, it returns params from access chain.
                            // Here we have existing args.
                            // Alternative: Just replace the string literal.
                            const keySpan = { s: arg0.getStart(sfAst), e: arg0.getEnd() };
                            const keyText = `'${newKey}'`;
                            const k = `${keySpan.s}:${keySpan.e}`;
                            if (!seen.has(k)) {
                                reps.push({ s: keySpan.s, e: keySpan.e, text: keyText });
                                seen.add(k);
                                handledRanges.push({ s: keySpan.s, e: keySpan.e });
                            }
                        }
                    }
                }
            }
        }
        if (typescript_1.default.isCallExpression(node) && typescript_1.default.isPropertyAccessExpression(node.expression) && node.expression.name.getText(sfAst) === 'replace') {
            const calls = [];
            let cur = node;
            while (typescript_1.default.isCallExpression(cur) && typescript_1.default.isPropertyAccessExpression(cur.expression) && cur.expression.name.getText(sfAst) === 'replace') {
                calls.unshift(cur);
                cur = cur.expression.expression;
            }
            const base = cur;
            const aliasName = getAliasName(base);
            if (aliasName && info.has(aliasName)) {
                const ai = info.get(aliasName);
                const res = (0, key_resolver_1.resolveKeyFromAccess)(sfAst, base, ai.prefix || null, (ai.roots && ai.roots.length) ? ai.roots : (0, dict_reader_1.getAllRoots)());
                const params = {};
                for (const c of calls) {
                    const [a0, a1] = c.arguments;
                    if (a0 && typescript_1.default.isStringLiteral(a0) && a1) {
                        const m = a0.text.match(/^\{([^}]+)\}$/);
                        const key = m ? m[1] : a0.text;
                        // 如果是字符串字面量，使用其文本内容（避免 printer 增加额外的引号）
                        if (typescript_1.default.isStringLiteral(a1)) {
                            params[key] = `'${a1.text.replace(/'/g, "\\'")}'`;
                        }
                        else {
                            params[key] = printer.printNode(typescript_1.default.EmitHint.Unspecified, a1, sfAst);
                        }
                    }
                }
                const text = (0, ts_replace_1.renderTsGet)(replaceVar, { keyExpr: res.keyExpr, params });
                const start = base.getStart(sfAst);
                const end = node.getEnd();
                const key = `${start}:${end}`;
                if (!seen.has(key)) {
                    reps.push({ s: start, e: end, text });
                    seen.add(key);
                    handledRanges.push({ s: start, e: end });
                }
            }
        }
        typescript_1.default.forEachChild(node, visitAst);
    };
    visitAst(sfAst);
    // Remove alias assignment statements in constructor
    for (const a of aliases) {
        if (a.declRange) {
            console.error('[DEBUG] Checking removal for alias:', a.name, a.declRange);
            const k = `${a.declRange.s}:${a.declRange.e}`;
            if (!seen.has(k)) {
                const overlap = reps.some(r => r.s >= a.declRange.s && r.e <= a.declRange.e);
                if (!overlap) {
                    console.error('[DEBUG] Adding removal rep:', a.name, a.declRange);
                    reps.push({ s: a.declRange.s, e: a.declRange.e, text: '' });
                    seen.add(k);
                }
                else {
                    console.error('[DEBUG] Skipping removal due to overlap:', a.name, a.declRange);
                }
            }
        }
        else {
            console.error('[DEBUG] Alias has no declRange:', a.name);
        }
    }
    console.log('[DEBUG] Final reps:', reps.map(r => ({ ...r, text: r.text.slice(0, 50) })));
    if (reps.length) {
        reps.sort((a, b) => b.s - a.s);
        for (const r of reps)
            s = s.slice(0, r.s) + r.text + s.slice(r.e);
    }
    // Fallback: plain property chains not followed by call/replace/[ or assignment
    for (const a of aliases) {
        const name = a.name;
        const composeKey = (path) => {
            if (a.prefix)
                return `${a.prefix}.${path}`;
            const roots = (a.roots && a.roots.length) ? a.roots : (0, dict_reader_1.getAllRoots)();
            if (roots && roots.length) {
                const r = (0, dict_reader_1.pickRoot)(roots, path);
                return r ? `${r}.${path}` : path;
            }
            return path;
        };
        s = s.replace(new RegExp(`this\\.${name}\\.(?!get\\b)([A-Za-z0-9_.]+)(?!\\s*\\(|\\s*\\.replace|\\s*\\[|\\s*=)`, 'g'), (_m, path) => {
            const keyExpr = composeKey(String(path));
            return `this.${replaceVar}.get('${keyExpr}')`;
        });
    }
    if (serviceName) {
        s = s.replace(new RegExp(`this\\.([A-Za-z_]\\w*)\\s*=\\s*this\\.${serviceName}\\.(?:getLocale|getLocal)\\([^)]*\\)\\.([A-Za-z0-9_.]+)`, 'g'), (_m, v, path) => {
            const segs = String(path).split('.');
            const root = segs.shift() || '';
            const rest = segs.join('.');
            if (root && rest && (0, dict_reader_1.hasKey)(root, rest)) {
                return `this.${String(v)} = this.${replaceVar}.get('${root}.${rest}')`;
            }
            return _m;
        });
    }
    return s;
}
function replaceHtml(src, aliases) {
    let s = src; // 工作副本
    const info = new Map(); // 名称到别名信息
    for (const a of aliases)
        info.set(a.name, a); // 填充映射
    const getPrefix = (ai, key) => {
        if (ai.prefix)
            return ai.prefix + '.';
        const roots = (ai.roots && ai.roots.length) ? ai.roots : (0, dict_reader_1.getAllRoots)();
        if (roots && roots.length) {
            const rp = (0, dict_reader_1.pickRoot)(roots, key);
            return rp ? rp + '.' : '';
        }
        return '';
    };
    s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)((?:\.replace\([^)]*\))+)[^}]*\}\}/g, (_m, v, key, chain) => {
        const ai = info.get(String(v)); // 获取别名信息
        if (!ai)
            return _m; // 未识别则原样返回
        const rootPrefix = getPrefix(ai, String(key)); // 根前缀
        const params = (0, params_extractor_1.extractReplaceParams)(chain); // 参数对象
        const keys = Object.keys(params);
        const p = keys.length ? `: {${keys.map(k => `${k}: ${params[k]}`).join(', ')}}` : ''; // 管道参数文本
        return `{{ '${rootPrefix}${key}' | i18n${p} }}`; // 渲染管道
    });
    s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)\s*\[(['"])([^'\"]+)\3\]\s*\}\}/g, (_m, v, base, _q, lit) => {
        const ai = info.get(String(v)); // 别名信息
        if (!ai)
            return _m; // 未识别返回
        const rootPrefix = getPrefix(ai, String(base)); // 根前缀
        return `{{ '${rootPrefix}${base}.${lit}' | i18n }}`; // 渲染
    });
    s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)\s*\[([^\]]+)\]\s*\}\}/g, (_m, v, base, expr) => {
        const ai = info.get(String(v)); // 别名信息
        if (!ai)
            return _m; // 未识别返回
        const rootPrefix = getPrefix(ai, String(base)); // 根前缀
        return `{{ ('${rootPrefix}${base}.' + ${expr.trim()}) | i18n }}`; // 渲染
    });
    s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)\s*\}\}/g, (_m, v, key) => {
        const ai = info.get(String(v)); // 别名信息
        if (!ai)
            return _m; // 未识别返回
        const rootPrefix = getPrefix(ai, String(key)); // 根前缀
        return `{{ '${rootPrefix}${key}' | i18n }}`; // 渲染
    });
    return s; // 返回替换后的模板
}
function injectI18nPipe(code, filePath) {
    let s = code;
    // 1. Find imports to determine path
    const match = s.match(/import\s*\{[^}]*I18nLocaleService[^}]*\}\s*from\s*['"]([^'"]+)['"]/);
    let pipePath = '../../i18n/i18n.pipe'; // Default fallback
    if (match) {
        const servicePath = match[1]; // e.g. './i18n' or '../../i18n'
        if (servicePath.endsWith('/i18n')) {
            pipePath = servicePath + '/i18n.pipe';
        }
    }
    else if (filePath) {
        // Try to guess based on depth?
        // 'app/app.component.ts' -> './i18n/i18n.pipe'
        // 'app/examples/x/x.ts' -> '../../i18n/i18n.pipe'
        // Just check if it contains 'examples'?
        if (!filePath.includes('examples/')) {
            pipePath = './i18n/i18n.pipe';
        }
    }
    // 2. Add import if not exists
    if (!s.includes('I18nPipe')) {
        // Insert after last import
        const lastImport = s.lastIndexOf('import ');
        if (lastImport >= 0) {
            const endOfImport = s.indexOf('\n', lastImport);
            if (endOfImport >= 0) {
                s = s.slice(0, endOfImport + 1) + `import { I18nPipe } from '${pipePath}';\n` + s.slice(endOfImport + 1);
            }
        }
    }
    // 3. Add to Component imports
    s = s.replace(/(imports\s*:\s*\[)([^\]]*)(\])/, (m, start, content, end) => {
        if (content.includes('I18nPipe'))
            return m;
        const cleanContent = content.trim();
        const hasComma = cleanContent.endsWith(',');
        const separator = cleanContent.length > 0 ? (hasComma ? ' ' : ', ') : '';
        return `${start}${content}${separator}I18nPipe${end}`;
    });
    return s;
}
function injectService(code, filePath) {
    const sf = typescript_1.default.createSourceFile('x.ts', code, typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS);
    let s = code;
    const insertions = [];
    let addedService = false;
    const visit = (node) => {
        if (typescript_1.default.isClassDeclaration(node)) {
            let usesService = false;
            const varName = config_1.config.serviceVariableName;
            const checkUsage = (n) => {
                if (typescript_1.default.isPropertyAccessExpression(n)) {
                    if (n.expression.kind === typescript_1.default.SyntaxKind.ThisKeyword && n.name.text === varName) {
                        usesService = true;
                    }
                }
                if (!usesService)
                    typescript_1.default.forEachChild(n, checkUsage);
            };
            typescript_1.default.forEachChild(node, checkUsage);
            if (usesService) {
                let ctor;
                for (const m of node.members) {
                    if (typescript_1.default.isConstructorDeclaration(m)) {
                        ctor = m;
                        break;
                    }
                }
                if (ctor) {
                    let hasService = false;
                    for (const p of ctor.parameters) {
                        if (typescript_1.default.isIdentifier(p.name) && p.name.text === varName)
                            hasService = true;
                    }
                    if (!hasService) {
                        const paramText = `private ${varName}: ${config_1.config.serviceTypeName}`;
                        if (ctor.parameters.length > 0) {
                            insertions.push({ pos: ctor.parameters[0].getStart(sf), text: paramText + ', ' });
                        }
                        else {
                            const openParen = ctor.getChildren(sf).find(t => t.kind === typescript_1.default.SyntaxKind.OpenParenToken);
                            if (openParen) {
                                insertions.push({ pos: openParen.end, text: paramText });
                            }
                        }
                        addedService = true;
                    }
                }
                else {
                    const paramText = `private ${varName}: ${config_1.config.serviceTypeName}`;
                    const ctorText = `\n  constructor(${paramText}) {}\n`;
                    if (node.members.length > 0) {
                        insertions.push({ pos: node.members[0].getFullStart(), text: ctorText });
                    }
                    else {
                        const closeBrace = node.getChildren(sf).find(t => t.kind === typescript_1.default.SyntaxKind.CloseBraceToken);
                        if (closeBrace) {
                            insertions.push({ pos: closeBrace.getStart(sf), text: ctorText });
                        }
                    }
                    addedService = true;
                }
            }
        }
        typescript_1.default.forEachChild(node, visit);
    };
    visit(sf);
    insertions.sort((a, b) => b.pos - a.pos);
    for (const ins of insertions) {
        s = s.slice(0, ins.pos) + ins.text + s.slice(ins.pos);
    }
    if (addedService) {
        const importRegex = new RegExp(`import\\s*\\{[^}]*${config_1.config.serviceTypeName}[^}]*\\}`);
        if (!importRegex.test(s)) {
            let importPath = './i18n';
            if (filePath) {
                const targetDir = path.resolve(process.cwd(), config_1.config.dictDir || 'src/app/i18n');
                const currentDir = path.dirname(filePath);
                let rel = path.relative(currentDir, targetDir);
                if (!rel.startsWith('.'))
                    rel = './' + rel;
                importPath = rel.replace(/\\/g, '/');
            }
            const importStmt = `import { ${config_1.config.serviceTypeName} } from '${importPath}';\n`;
            const lastImport = s.lastIndexOf('import ');
            if (lastImport >= 0) {
                const eol = s.indexOf('\n', lastImport);
                if (eol >= 0) {
                    s = s.slice(0, eol + 1) + importStmt + s.slice(eol + 1);
                }
                else {
                    s = s + '\n' + importStmt;
                }
            }
            else {
                s = importStmt + s;
            }
        }
    }
    return s;
}
function processComponent(tsCode, htmlCode, filePath, externalAliases) {
    const { aliases: rawAliases, serviceName } = buildAliases(tsCode, externalAliases); // 基于原始 TS 构建别名
    const aliasInfos = filterLeafAliases(tsCode, rawAliases);
    const varNames = rawAliases.map(a => a.name); // 收集所有别名变量名（包括未使用的，以便清理定义）
    let tsOut = replaceTs(tsCode, externalAliases); // 统一 TS 访问形态
    // 统一别名 get 调用到 this.i18n.get(...)
    for (const ai of aliasInfos) { // 遍历别名
        const target = config_1.config.serviceVariableName || 'i18n';
        if (ai.name !== target) { // 非 service 别名统一指向 service
            tsOut = tsOut.replace(new RegExp(`this\\.${ai.name}\\.get(?!Locale)\\s*\\(`, 'g'), `this.${target}.get(`); // 调用替换
        }
    }
    // Removed aggressive constructor renaming to respect user's service variable name
    tsOut = injectService(tsOut, filePath);
    // tsOut = injectI18nPipe(tsOut, filePath) // 注入 I18nPipe
    // Cleanup blank lines
    tsOut = tsOut.replace(/(\r?\n){3,}/g, '\n\n');
    const { aliases: htmlAliases } = buildAliases(tsCode, externalAliases); // 基于原 TS 收集用于 HTML 的别名
    const htmlOut = replaceHtml(htmlCode, htmlAliases); // 替换模板
    return { tsOut, htmlOut, aliases: varNames }; // 返回结果
}
exports.processComponent = processComponent;
