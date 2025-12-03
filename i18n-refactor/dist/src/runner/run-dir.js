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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const typescript_1 = __importDefault(require("typescript"));
const params_extractor_1 = require("../core/params-extractor");
const prune_1 = require("../replace/prune");
const var_alias_1 = require("../core/var-alias");
const ts_replace_1 = require("../replace/ts-replace");
const dict_reader_1 = require("../util/dict-reader");
function readFile(p) { return fs.readFileSync(p, 'utf8'); }
function writeFile(p, s) { fs.writeFileSync(p, s, 'utf8'); }
function walk(dir, filter) {
    const out = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory())
            out.push(...walk(full, filter));
        else if (filter(full))
            out.push(full);
    }
    return out;
}
function replaceHtmlContent(src, aliasInfos) {
    let s = src;
    const info = new Map();
    for (const a of aliasInfos)
        info.set(a.name, { roots: a.roots, prefix: a.prefix });
    // 链式模板替换：{{ var.key.replace('{a}', x).replace('{b}', y) }} → {{ 'key' | i18n: {a:x,b:y} }}
    s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)((?:\.replace\([^)]*\))+)[^}]*\}\}/g, (_m, v, key, chain) => {
        const vn = String(v);
        const ai = info.get(vn);
        if (!ai)
            return _m;
        const rp = ai.roots && ai.roots.length ? (0, dict_reader_1.pickRoot)(ai.roots, String(key)) : '';
        const rootPrefix = rp ? rp + '.' : '';
        const params = (0, params_extractor_1.extractReplaceParams)(chain);
        const p = Object.keys(params).length ? `: ${JSON.stringify(params)}` : '';
        return `{{ '${rootPrefix}${key}' | i18n${p} }}`;
    });
    // 索引字面量：{{ var.key['x'] }} 或 {{ var.key["x"] }}
    s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)\s*\[(['"])([^'\"]+)\3\]\s*\}\}/g, (_m, v, base, _q, lit) => {
        const vn = String(v);
        const ai = info.get(vn);
        if (!ai)
            return _m;
        const rp = ai.roots && ai.roots.length ? (0, dict_reader_1.pickRoot)(ai.roots, String(base)) : '';
        const rootPrefix = rp ? rp + '.' : '';
        return `{{ '${rootPrefix}${base}.${lit}' | i18n }}`;
    });
    // 索引动态表达式：{{ var.key[idx] }} → {{ ('key.' + idx) | i18n }}
    s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)\s*\[([^\]]+)\]\s*\}\}/g, (_m, v, base, expr) => {
        const vn = String(v);
        const ai = info.get(vn);
        if (!ai)
            return _m;
        const rp = ai.roots && ai.roots.length ? (0, dict_reader_1.pickRoot)(ai.roots, String(base)) : '';
        const rootPrefix = rp ? rp + '.' : '';
        return `{{ ('${rootPrefix}${base}.' + ${expr.trim()}) | i18n }}`;
    });
    // 简单属性：{{ var.key }} → {{ 'key' | i18n }}
    s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)\s*\}\}/g, (_m, v, key) => {
        const vn = String(v);
        const ai = info.get(vn);
        if (!ai)
            return _m;
        const rp = ai.roots && ai.roots.length ? (0, dict_reader_1.pickRoot)(ai.roots, String(key)) : '';
        const rootPrefix = rp ? rp + '.' : '';
        return `{{ '${rootPrefix}${key}' | i18n }}`;
    });
    return s;
}
function toReplaceChain(params) {
    let chain = '';
    for (const k of Object.keys(params)) {
        chain += `.replace('{${k}}', ${params[k]})`;
    }
    return chain;
}
function restoreHtmlContent(src, alias) {
    const varName = alias || 'i18n';
    let s = src;
    // 还原：{{ 'a.b.c' | i18n: {k:expr} }} → {{ varName.a.b.c.replace('{k}', expr) }}
    s = s.replace(/\{\{\s*'([A-Za-z0-9_.]+)'\s*\|\s*i18n\s*:\s*(\{[^}]*\})\s*\}\}/g, (_m, key, obj) => {
        try {
            // 将对象字面量安全解析为键值对（保留 expr 文本，简单替换引号包装保持原值）
            const sanitized = obj.replace(/(['"])\s*([^:'"])\s*\1\s*:/g, (_mm, _q, k) => `'${k}':`); // 规范化键
            const parsed = Function(`return (${sanitized})`)();
            const chain = toReplaceChain(parsed);
            return `{{ ${varName}.${key}${chain} }}`;
        }
        catch {
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
    const re = /this\.([A-Za-z_]\w*)\s*=\s*[^;]*\.getLocale\([^)]*\)/g;
    let m;
    while ((m = re.exec(tsCode)))
        names.add(m[1]);
    return Array.from(names);
}
function buildAliases(tsCode) {
    const sf = typescript_1.default.createSourceFile('x.ts', tsCode, typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS);
    const aliases = (0, var_alias_1.collectVarAliases)(sf, 'locale', 'getLocale');
    const out = [];
    for (const a of aliases)
        out.push({ name: a.name, prefix: a.prefix, roots: a.roots });
    const rx = /\b([A-Za-z_]\w*)\s*=\s*this\.locale\.getLocale\s*\(/g;
    let m;
    while ((m = rx.exec(tsCode)))
        out.push({ name: m[1], prefix: null });
    if (/this\.i18n\./.test(tsCode) && !out.find(x => x.name === 'i18n'))
        out.push({ name: 'i18n', prefix: null });
    if (/this\.dict\./.test(tsCode) && !out.find(x => x.name === 'dict'))
        out.push({ name: 'dict', prefix: null });
    const rxAny = /this\.([A-Za-z_]\w*)\./g;
    let am;
    while ((am = rxAny.exec(tsCode))) {
        const nm = am[1];
        if (nm !== 'locale' && !out.find(x => x.name === nm))
            out.push({ name: nm, prefix: null });
    }
    return Array.from(new Set(out.map(o => JSON.stringify(o)))).map(s => JSON.parse(s));
}
function replaceTsContent(src) {
    let s = src;
    const aliases = buildAliases(src);
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
        s = s.replace(new RegExp(`this\.${name}\.([A-Za-z0-9_.]+)((?:\\.replace\\([^)]*\\))+)`, 'g'), (_m, path, chain) => {
            const params = (0, params_extractor_1.extractReplaceParams)(chain);
            return (0, ts_replace_1.renderTsGet)(name, { keyExpr: composeKey(String(path)), params });
        });
        // element access with string literal '...'
        s = s.replace(new RegExp(`this\.${name}\.([A-Za-z0-9_.]+)\\s*\\[\\s*'([^']+)'\\s*\\]`, 'g'), (_m, base, lit) => {
            return (0, ts_replace_1.renderTsGet)(name, { keyExpr: composeKey(`${String(base)}.${String(lit)}`) });
        });
        // element access with string literal "..."
        s = s.replace(new RegExp(`this\.${name}\.([A-Za-z0-9_.]+)\\s*\\[\\s*\"([^\"]+)\"\\s*\\]`, 'g'), (_m, base, lit) => {
            return (0, ts_replace_1.renderTsGet)(name, { keyExpr: composeKey(`${String(base)}.${String(lit)}`) });
        });
        // dynamic element access [expr]
        s = s.replace(new RegExp(`this\.${name}\.([A-Za-z0-9_.]+)\\s*\\[([^\\]]+)\\]`, 'g'), (_m, base, expr) => {
            const basePath = composeKey(String(base));
            return (0, ts_replace_1.renderTsGet)(name, { keyExpr: `'${basePath}.' + ${String(expr).trim()}` });
        });
        // plain property chain (not followed by call/replace/[ or assignment)
        s = s.replace(new RegExp(`(^|[\\s,(])this\.${name}\.([A-Za-z0-9_.]+)(?!\\s*\\(|\\s*\\.replace|\\s*\\[|\\s*=)`, 'g'), (_m, pre, path) => {
            return `${pre}${(0, ts_replace_1.renderTsGet)(name, { keyExpr: composeKey(String(path)) })}`;
        });
    }
    return s;
}
function processTsFile(tsPath) {
    const before = readFile(tsPath);
    const varNames = collectGetLocalVars(before);
    let after = (0, prune_1.pruneUnused)({}, before, varNames);
    after = replaceTsContent(after);
    // unify alias get-calls to this.i18n.get
    const aliasInfos = buildAliases(after);
    for (const a of aliasInfos) {
        if (a.name !== 'i18n') {
            after = after.replace(new RegExp(`this\\.${a.name}\\\.get(?!Locale)\\s*\\(`, 'g'), 'this.i18n.get(');
            after = after.replace(new RegExp(`\\b${a.name}\\s*:\\s*any\\s*;`, 'g'), '');
        }
    }
    // normalize constructor to inject I18nService
    after = after.replace(/constructor\s*\(([^)]*)\)/, (m, params) => {
        let p = params;
        p = p.replace(/\b(private|public)?\s*locale\s*:\s*I18nLocaleService\b/, 'public i18n: I18nService');
        if (!/I18nService\b/.test(p)) {
            p = (p.trim().length ? p + ', ' : '') + 'public i18n: I18nService';
        }
        return `constructor(${p})`;
    });
    // remove remaining getLocale/getLocal assignments
    after = after.replace(/this\.[A-Za-z_]\w*\s*=\s*[^;]*\.(?:getLocal|getLocale)\([^)]*\)(?:\.[A-Za-z0-9_.]+)?\s*;?/g, '');
    const sf = typescript_1.default.createSourceFile(tsPath, after, typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS);
    const aliases = (0, var_alias_1.collectVarAliases)(sf, 'locale', 'getLocale').map(a => a.name);
    // also include direct assignments from locale.getLocale()
    const rx = /\b([A-Za-z_]\w*)\s*=\s*this\.locale\.getLocale\s*\(/g;
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
function collectHtmlAliases(tsPath) {
    try {
        const code = readFile(tsPath);
        const sf = typescript_1.default.createSourceFile('c.ts', code, typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS);
        const aliases = (0, var_alias_1.collectVarAliases)(sf, 'locale', 'getLocale');
        const names = new Set();
        for (const a of aliases)
            names.add(a.name);
        const rx = /\b([A-Za-z_]\w*)\s*=\s*this\.locale\.getLocale\s*\(/g;
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
    const args = process.argv.slice(2);
    let dir = process.cwd();
    let mode = 'replace';
    for (const a of args) {
        const m = a.match(/^--dir=(.+)$/);
        if (m)
            dir = path.isAbsolute(m[1]) ? m[1] : path.join(process.cwd(), m[1]);
        const r = a.match(/^--mode=(replace|restore)$/);
        if (r)
            mode = r[1];
        const d = a.match(/^--dictDir=(.+)$/);
        if (d)
            (0, dict_reader_1.setDictDir)(d[1]);
    }
    const tsFiles = walk(dir, p => p.endsWith('.ts'));
    const results = [];
    for (const f of tsFiles) {
        const r = processTsFile(f);
        results.push({ file: f, type: 'ts', changed: r.changed });
        if (r.htmlPath && fs.existsSync(r.htmlPath)) {
            const aliasInfos = buildAliases(r.code);
            const hr = processHtmlWithAliases(r.htmlPath, mode, aliasInfos);
            results.push({ file: r.htmlPath, type: 'html', changed: hr.changed });
        }
    }
    const changed = results.filter(r => r.changed).length;
    const summary = { dir, files: results.length, changed };
    process.stdout.write(JSON.stringify({ summary, results }, null, 2) + '\n');
}
main();
