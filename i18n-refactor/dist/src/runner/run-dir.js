#!/usr/bin/env node
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
exports.processTsFile = void 0;
const fs = __importStar(require("fs")); // 文件系统，用于读写
const path = __importStar(require("path")); // 路径工具，用于定位
const typescript_1 = __importDefault(require("typescript")); // TypeScript AST 解析
const params_extractor_1 = require("../core/params-extractor"); // 提取 replace 参数对象
const prune_1 = require("../replace/prune"); // 清理无用别名声明/赋值
const var_alias_1 = require("../core/var-alias"); // AST 收集别名信息
const ts_replace_1 = require("../replace/ts-replace"); // 渲染 TS 调用 this.<alias>.get
const dict_reader_1 = require("../util/dict-reader"); // 选择字典根与设置字典目录与键校验
const template_usage_1 = require("../core/template-usage");
const html_replace_1 = require("../replace/html-replace");
const config_1 = require("../core/config"); // 统一配置
const logger_1 = require("../util/logger"); // 日志
function readFile(p) { return fs.readFileSync(p, 'utf8'); } // 读取文本文件
let dryRun = false; // 干运行，默认关闭
let missingKeyCount = 0; // 静态键缺失计数
function writeFile(p, s) { if (!dryRun)
    fs.writeFileSync(p, s, 'utf8'); } // 写出文本文件（支持 dry-run）
function walk(dir, filter) {
    const out = []; // 输出文件列表
    const entries = fs.readdirSync(dir, { withFileTypes: true }); // 读取目录条目
    for (const e of entries) { // 遍历条目
        const full = path.join(dir, e.name); // 计算完整路径
        if (e.isDirectory())
            out.push(...walk(full, filter)); // 目录则递归
        else if (filter(full))
            out.push(full); // 文件且匹配过滤器则加入
    }
    return out; // 返回
}
function replaceHtmlContent(src, aliasInfos) {
    const info = new Map();
    for (const a of aliasInfos)
        info.set(a.name, { roots: a.roots, prefix: a.prefix });
    const varNames = aliasInfos.map(a => a.name);
    const uses = (0, template_usage_1.collectTemplateUsages)(src, varNames);
    const computeKeyExpr = (u, ai) => {
        if (!ai)
            return u.keyExpr;
        // 动态：`'base.' + expr` → 加根前缀
        if (u.dynamicSegments && u.dynamicSegments.length) {
            const m = u.keyExpr.match(/^'([^']+)\.'\s*\+\s*(.+)$/);
            if (m) {
                const base = m[1];
                const rp = ai.roots && ai.roots.length ? (0, dict_reader_1.pickRoot)(ai.roots, base) : '';
                const rootPrefix = rp ? rp + '.' : (ai.prefix ? ai.prefix + '.' : '');
                return `'${rootPrefix}${base}.' + ${m[2]}`;
            }
            return u.keyExpr;
        }
        // 静态：加根前缀或选根
        const path = u.keyExpr;
        if (ai.prefix)
            return `${ai.prefix}.${path}`;
        if (ai.roots && ai.roots.length) {
            const rp = (0, dict_reader_1.pickRoot)(ai.roots, path);
            return rp ? `${rp}.${path}` : path;
        }
        return path;
    };
    // 生成替换片段
    const reps = uses.map(u => {
        const ai = info.get(u.varName);
        const keyExpr = computeKeyExpr(u, ai);
        const pipe = (0, html_replace_1.renderHtmlPipe)({ ...u, keyExpr });
        return { s: u.start, e: u.end, text: pipe };
    }).sort((a, b) => b.s - a.s);
    // 应用替换
    let out = src;
    for (const r of reps)
        out = out.slice(0, r.s) + r.text + out.slice(r.e);
    return out;
}
function toReplaceChain(params) {
    let chain = '';
    for (const k of Object.keys(params)) {
        chain += `.replace('{${k}}', ${params[k]})`;
    }
    return chain;
}
function parseObjectLiteralText(objText) {
    const sf = typescript_1.default.createSourceFile('o.ts', `const __x = ${objText};`, typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS);
    const out = {};
    const visit = (node) => {
        if (typescript_1.default.isVariableStatement(node)) {
            for (const decl of node.declarationList.declarations) {
                if (decl.initializer && typescript_1.default.isObjectLiteralExpression(decl.initializer)) {
                    for (const prop of decl.initializer.properties) {
                        if (!typescript_1.default.isPropertyAssignment(prop))
                            continue;
                        const key = typescript_1.default.isIdentifier(prop.name) ? prop.name.text : typescript_1.default.isStringLiteral(prop.name) ? prop.name.text : '';
                        if (!key)
                            continue;
                        const val = prop.initializer.getText(sf);
                        out[key] = val;
                    }
                }
            }
        }
        typescript_1.default.forEachChild(node, visit);
    };
    visit(sf);
    return out;
}
function restoreHtmlContent(src, alias) {
    const varName = alias || 'i18n';
    let s = src;
    // 还原：{{ 'a.b.c' | i18n: {k:expr} }} → {{ varName.a.b.c.replace('{k}', expr) }}
    s = s.replace(/\{\{\s*'([A-Za-z0-9_.]+)'\s*\|\s*i18n\s*:\s*(\{[^}]*\})\s*\}\}/g, (_m, key, obj) => {
        try {
            const parsed = parseObjectLiteralText(obj);
            const chain = toReplaceChain(parsed);
            return `{{ ${varName}.${key}${chain} }}`;
        }
        catch {
            (0, logger_1.warn)('restoreHtml parse params failed', { key });
            return `{{ ${varName}.${key} }}`;
        }
    });
    // 还原：{{ ('a.b.' + idx) | i18n }} → {{ varName.a.b[idx] }}
    s = s.replace(/\{\{\s*\('([A-Za-z0-9_.]+)\.'\s*\+\s*([^\)]+)\)\s*\|\s*i18n\s*\}\}/g, (_m, base, expr) => {
        return `{{ ${varName}.${base}[${expr.trim()}] }}`;
    });
    // 还原：{{ 'a.b.c' | i18n }} → {{ varName.a.b.c }}
    s = s.replace(/\{\{\s*'([A-Za-z0-9_.]+)'\s*\|\s*i18n\s*\}\}/g, (_m, key) => {
        return `{{ ${varName}.${key} }}`;
    });
    return s;
}
function collectGetLocalVars(tsCode) {
    const names = new Set();
    const re = new RegExp(`this\\.([A-Za-z_]\\w*)\\s*=\\s*[^;]*\\.${config_1.config.getLocalMethod}\\([^)]*\\)`, 'g');
    let m;
    while ((m = re.exec(tsCode)))
        names.add(m[1]);
    return Array.from(names);
}
function buildAliases(tsCode) {
    const sf = typescript_1.default.createSourceFile('x.ts', tsCode, typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS);
    const aliases = (0, var_alias_1.collectVarAliases)(sf, config_1.config.fallbackServiceParamName, config_1.config.getLocalMethod);
    const out = [];
    for (const a of aliases)
        out.push({ name: a.name, prefix: a.prefix, roots: a.roots });
    const rx = new RegExp(`\\b([A-Za-z_]\\w*)\\s*=\\s*this\\.${config_1.config.fallbackServiceParamName}\\.${config_1.config.getLocalMethod}\\s*\\(`, 'g');
    let m;
    while ((m = rx.exec(tsCode)))
        out.push({ name: m[1], prefix: null });
    if (/this\.i18n\./.test(tsCode) && !out.find(x => x.name === 'i18n'))
        out.push({ name: 'i18n', prefix: null });
    if (/this\.dict\./.test(tsCode) && !out.find(x => x.name === 'dict'))
        out.push({ name: 'dict', prefix: null });
    // 不再将所有 this.<name>. 视为别名，避免误替换普通对象/数组方法
    return Array.from(new Set(out.map(o => JSON.stringify(o)))).map(s => JSON.parse(s));
}
function replaceTsContent(src) {
    let s = src;
    const aliases = buildAliases(src);
    // AST-based replacement for plain property chains this.<alias>.<path>
    const sfAst = typescript_1.default.createSourceFile('x.ts', s, typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS);
    const reps = [];
    const info = new Map();
    for (const a of aliases)
        info.set(a.name, { prefix: a.prefix, roots: a.roots });
    const composeAstKey = (a, path) => {
        if (a.prefix)
            return `${a.prefix}.${path}`;
        if (a.roots && a.roots.length) {
            const r = (0, dict_reader_1.pickRoot)(a.roots, path);
            return r ? `${r}.${path}` : path;
        }
        return path;
    };
    const auditStaticKey = (a, path) => {
        let root = '';
        if (a.prefix) {
            const seg = a.prefix.split('.')[0];
            root = seg;
        }
        else if (a.roots && a.roots.length)
            root = (0, dict_reader_1.pickRoot)(a.roots, path);
        if (root) {
            const ok = (0, dict_reader_1.hasKey)(root, path);
            if (!ok) {
                missingKeyCount++;
                (0, logger_1.warn)('missing i18n key', { root, path });
            }
        }
    };
    const visitAst = (node) => {
        if (typescript_1.default.isPropertyAccessExpression(node)) {
            let outer = node;
            while (typescript_1.default.isPropertyAccessExpression(outer.parent) && outer.parent.expression === outer)
                outer = outer.parent;
            let cur = outer;
            const segs = [];
            while (typescript_1.default.isPropertyAccessExpression(cur)) {
                segs.unshift(cur.name.getText(sfAst));
                cur = cur.expression;
            }
            if (typescript_1.default.isPropertyAccessExpression(cur) && cur.expression.kind === typescript_1.default.SyntaxKind.ThisKeyword && typescript_1.default.isIdentifier(cur.name)) {
                const aliasName = cur.name.getText(sfAst);
                const ai = info.get(aliasName);
                if (ai) {
                    const p = outer.parent;
                    const isCall = typescript_1.default.isCallExpression(p) && p.expression === outer;
                    const isEl = typescript_1.default.isElementAccessExpression(p) && p.expression === outer;
                    const isAssignLHS = typescript_1.default.isBinaryExpression(p) && p.left === outer;
                    const isReplaceChain = typescript_1.default.isPropertyAccessExpression(p) && p.name.getText(sfAst) === 'replace';
                    if (!isCall && !isEl && !isAssignLHS && !isReplaceChain) {
                        const path = segs.join('.');
                        const text = (0, ts_replace_1.renderTsGet)(aliasName, { keyExpr: composeAstKey(ai, path) });
                        auditStaticKey(ai, path);
                        reps.push({ s: outer.getStart(sfAst), e: outer.getEnd(), text });
                    }
                }
            }
        }
        typescript_1.default.forEachChild(node, visitAst);
    };
    visitAst(sfAst);
    if (reps.length) {
        reps.sort((a, b) => b.s - a.s);
        for (const r of reps)
            s = s.slice(0, r.s) + r.text + s.slice(r.e);
    }
    for (const a of aliases) {
        const name = a.name;
        const composeKey = (path) => {
            if (a.prefix)
                return `${a.prefix}.${path}`;
            if (a.roots && a.roots.length) {
                const r = (0, dict_reader_1.pickRoot)(a.roots, path);
                return r ? `${r}.${path}` : path;
            }
            return path;
        };
        // chain .replace()
        s = s.replace(new RegExp(`this\\.${name}\\.([A-Za-z0-9_.]+)((?:\\.replace\\([^)]*\\))+)`, 'g'), (_m, path, chain) => {
            const params = (0, params_extractor_1.extractReplaceParams)(chain);
            auditStaticKey(a, String(path));
            return (0, ts_replace_1.renderTsGet)(name, { keyExpr: composeKey(String(path)), params });
        });
        // element access with string literal '...'
        s = s.replace(new RegExp(`this\\.${name}\\.([A-Za-z0-9_.]+)\\s*\\[\\s*'([^']+)'\\s*\\]`, 'g'), (_m, base, lit) => {
            auditStaticKey(a, String(base) + '.' + String(lit));
            return (0, ts_replace_1.renderTsGet)(name, { keyExpr: composeKey(`${String(base)}.${String(lit)}`) });
        });
        // element access with string literal "..."
        s = s.replace(new RegExp(`this\\.${name}\\.([A-Za-z0-9_.]+)\\s*\\[\\s*\"([^\"]+)\"\\s*\\]`, 'g'), (_m, base, lit) => {
            auditStaticKey(a, String(base) + '.' + String(lit));
            return (0, ts_replace_1.renderTsGet)(name, { keyExpr: composeKey(`${String(base)}.${String(lit)}`) });
        });
        // dynamic element access [expr]
        s = s.replace(new RegExp(`this\\.${name}\\.([A-Za-z0-9_.]+)\\s*\\[([^\\]]+)\\]`, 'g'), (_m, base, expr) => {
            const basePath = composeKey(String(base));
            return (0, ts_replace_1.renderTsGet)(name, { keyExpr: `'${basePath}.' + ${String(expr).trim()}` });
        });
    }
    // Fallback: plain property chains not followed by call/replace/[ or assignment
    for (const a of aliases) {
        const name = a.name;
        const composeKey = (path) => {
            if (a.prefix)
                return `${a.prefix}.${path}`;
            if (a.roots && a.roots.length) {
                const r = (0, dict_reader_1.pickRoot)(a.roots, path);
                return r ? `${r}.${path}` : path;
            }
            return path;
        };
        s = s.replace(new RegExp(`this\\.${name}\\.(?!get\\b)([A-Za-z0-9_.]+)(?!\\s*\\(|\\s*\\.replace|\\s*\\[|\\s*=)`, 'g'), (_m, path) => {
            auditStaticKey(a, String(path));
            return (0, ts_replace_1.renderTsGet)(name, { keyExpr: composeKey(String(path)) });
        });
    }
    return s;
}
function processTsFile(tsPath) {
    const before = readFile(tsPath);
    const varNames = collectGetLocalVars(before);
    let after = replaceTsContent(before);
    after = (0, prune_1.pruneUnused)({}, after, varNames);
    // unify alias get-calls to this.i18n.get
    const aliasInfos = buildAliases(before);
    for (const a of aliasInfos) {
        if (a.name !== 'i18n') {
            after = after.replace(new RegExp(`this\\.${a.name}\\\.get(?!Locale)\\s*\\(`, 'g'), 'this.i18n.get(');
            after = after.replace(new RegExp(`\\b${a.name}\\s*:\\s*any\\s*;`, 'g'), '');
        }
    }
    // normalize constructor to inject I18nLocaleService as i18n
    after = after.replace(/constructor\s*\(([^)]*)\)/, (m, params) => {
        let p = params;
        p = p.replace(/\b(private|public)?\s*locale\s*:\s*I18nLocaleService\b/, 'public i18n: I18nLocaleService');
        return `constructor(${p})`;
    });
    // remove remaining getLocale/getLocal assignments
    after = after.replace(/this\.[A-Za-z_]\w*\s*=\s*[^;]*\.(?:getLocal|getLocale)\([^)]*\)(?:\.[A-Za-z0-9_.]+)?\s*;?/g, '');
    const sf = typescript_1.default.createSourceFile(tsPath, after, typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS);
    const aliases = (0, var_alias_1.collectVarAliases)(sf, config_1.config.fallbackServiceParamName, config_1.config.getLocalMethod).map(a => a.name);
    // also include direct assignments from locale.getLocale()
    const rx = new RegExp(`\\b([A-Za-z_]\\w*)\\s*=\\s*this\\.${config_1.config.fallbackServiceParamName}\\.${config_1.config.getLocalMethod}\\s*\\(`, 'g');
    let mm;
    while ((mm = rx.exec(after)))
        aliases.push(mm[1]);
    if (/\bi18n\s*:\s*/.test(after) || /this\.i18n\s*=/.test(after))
        aliases.push('i18n');
    if (/\bdict\s*:\s*/.test(after) || /this\.dict\s*=/.test(after))
        aliases.push('dict');
    // detect Angular Component and templateUrl
    let htmlPath = null;
    const visit = (node) => {
        if (typescript_1.default.isClassDeclaration(node)) {
            const decos = typescript_1.default.canHaveDecorators(node) ? typescript_1.default.getDecorators(node) : undefined;
            for (const d of decos || []) {
                const expr = d.expression;
                if (typescript_1.default.isCallExpression(expr) && typescript_1.default.isIdentifier(expr.expression) && expr.expression.text === 'Component') {
                    const arg = expr.arguments[0];
                    if (arg && typescript_1.default.isObjectLiteralExpression(arg)) {
                        for (const prop of arg.properties) {
                            if (typescript_1.default.isPropertyAssignment(prop) && typescript_1.default.isIdentifier(prop.name) && prop.name.text === 'templateUrl') {
                                const v = prop.initializer;
                                if (v && typescript_1.default.isStringLiteral(v)) {
                                    const dir = path.dirname(tsPath);
                                    htmlPath = path.resolve(dir, v.text);
                                }
                            }
                        }
                    }
                }
            }
        }
        typescript_1.default.forEachChild(node, visit);
    };
    visit(sf);
    if (after !== before)
        writeFile(tsPath, after);
    return { changed: after !== before, code: after, aliases: Array.from(new Set(aliases)), htmlPath };
}
exports.processTsFile = processTsFile;
function collectHtmlAliases(tsPath) {
    try {
        const code = readFile(tsPath);
        const sf = typescript_1.default.createSourceFile('c.ts', code, typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS);
        const aliases = (0, var_alias_1.collectVarAliases)(sf, config_1.config.fallbackServiceParamName, config_1.config.getLocalMethod);
        const names = new Set();
        for (const a of aliases)
            names.add(a.name);
        const rx = new RegExp(`\\b([A-Za-z_]\\w*)\\s*=\\s*this\\.${config_1.config.fallbackServiceParamName}\\.${config_1.config.getLocalMethod}\\s*\\(`, 'g');
        let m;
        while ((m = rx.exec(code)))
            names.add(m[1]);
        if (/\bi18n\s*:\s*/.test(code) || /this\.i18n\s*=/.test(code))
            names.add('i18n');
        if (/\bdict\s*:\s*/.test(code) || /this\.dict\s*=/.test(code))
            names.add('dict');
        return Array.from(names);
    }
    catch {
        return [];
    }
}
function processHtmlWithAliases(htmlPath, mode, aliasInfos) {
    const before = readFile(htmlPath);
    const aliasNames = aliasInfos.map(a => a.name);
    const alias = aliasNames.includes('i18n') ? 'i18n' : (aliasNames[0] || null);
    const after = mode === 'restore' ? restoreHtmlContent(before, alias) : replaceHtmlContent(before, aliasInfos);
    if (after !== before)
        writeFile(htmlPath, after);
    return { changed: after !== before };
}
function main() {
    const args = process.argv.slice(2); // 读取参数
    let dir = process.cwd(); // 默认目录为当前工作目录
    let mode = 'replace'; // 默认模式为替换
    let logLevel;
    let outFormat;
    const usage = `Usage: i18n-refactor [--dir=PATH] [--mode=replace|restore] [--dictDir=PATH] [--dry-run] [--logLevel=debug|info|warn|error] [--format=json|pretty] [--config=PATH] [--help] [--version]`;
    const version = '0.1.0';
    for (const a of args) { // 解析参数
        const m = a.match(/^--dir=(.+)$/); // 指定目录
        if (m)
            dir = path.isAbsolute(m[1]) ? m[1] : path.join(process.cwd(), m[1]); // 解析绝对/相对路径
        const r = a.match(/^--mode=(replace|restore)$/); // 指定模式
        if (r)
            mode = r[1]; // 设置模式
        const d = a.match(/^--dictDir=(.+)$/); // 指定字典目录
        if (d)
            (0, dict_reader_1.setDictDir)(d[1]); // 设置目录
        const dl = a.match(/^--logLevel=(debug|info|warn|error)$/);
        if (dl)
            logLevel = dl[1];
        const fm = a.match(/^--format=(json|pretty)$/);
        if (fm)
            outFormat = fm[1];
        if (a === '--dry-run')
            dryRun = true;
        const cf = a.match(/^--config=(.+)$/);
        if (cf) {
            try {
                const p = path.isAbsolute(cf[1]) ? cf[1] : path.join(process.cwd(), cf[1]);
                const txt = fs.readFileSync(p, 'utf8');
                const obj = JSON.parse(txt);
                if (obj.serviceTypeName)
                    config_1.config.serviceTypeName = obj.serviceTypeName;
                if (obj.getLocalMethod)
                    config_1.config.getLocalMethod = obj.getLocalMethod;
                if (obj.fallbackServiceParamName)
                    config_1.config.fallbackServiceParamName = obj.fallbackServiceParamName;
                if (obj.tsGetHelperName)
                    config_1.config.tsGetHelperName = obj.tsGetHelperName;
                (0, logger_1.info)('config loaded', { path: p });
            }
            catch (e) {
                (0, logger_1.warn)('config load failed', {});
            }
        }
        if (a === '--help') {
            process.stdout.write(usage + '\n');
            return;
        }
        if (a === '--version') {
            process.stdout.write(version + '\n');
            return;
        }
    }
    (0, logger_1.configureLogger)({ level: logLevel, format: outFormat });
    (0, logger_1.info)('start', { dir, mode, dryRun });
    const tsFiles = walk(dir, p => p.endsWith('.ts')); // 收集 TS 文件
    const results = []; // 结果列表
    for (const f of tsFiles) { // 遍历 TS
        const r = processTsFile(f); // 处理 TS 文件
        results.push({ file: f, type: 'ts', changed: r.changed }); // 记录结果
        if (r.htmlPath && fs.existsSync(r.htmlPath)) { // 若关联模板存在
            const aliasInfos = buildAliases(r.code); // 基于替换后 TS 构建别名信息
            const hr = processHtmlWithAliases(r.htmlPath, mode, aliasInfos); // 处理模板
            results.push({ file: r.htmlPath, type: 'html', changed: hr.changed }); // 记录结果
        }
    }
    const changed = results.filter(r => r.changed).length; // 统计变更数
    const summary = { dir, files: results.length, changed, missingKeys: missingKeyCount }; // 汇总信息
    if ((outFormat || 'json') === 'json')
        process.stdout.write(JSON.stringify({ summary, results }, null, 2) + '\n');
    else {
        (0, logger_1.info)('summary', summary);
        for (const r of results)
            (0, logger_1.info)('result', r);
    }
}
if (require.main === module) {
    main(); // 执行主程序
}
