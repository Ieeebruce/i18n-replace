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
exports.writeHtmlReportForTest = exports.main = exports.emitJson = exports.ensureAngularFiles = exports.processTsFile = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const typescript_1 = __importDefault(require("typescript"));
const config_1 = require("../core/config");
const logger_1 = require("../util/logger");
const dict_reader_1 = require("../util/dict-reader");
const component_1 = require("./component");
const dict_flatten_1 = require("../util/dict-flatten");
const prune_1 = require("../replace/prune");
const var_alias_1 = require("../core/var-alias");
function readFile(p) { return fs.readFileSync(p, 'utf8'); } // 读取文本文件
let dryRun = !!config_1.config.dryRun; // 干运行，从配置读取
let missingKeyCount = 0; // 静态键缺失计数
function writeFile(p, s) { if (!dryRun)
    fs.writeFileSync(p, s, 'utf8'); } // 写出文本文件（支持 dry-run）
function walk(dir, filter) {
    const out = []; // 输出文件列表
    const entries = fs.readdirSync(dir, { withFileTypes: true }); // 读取目录条目
    for (const e of entries) { // 遍历条目
        if (e.name === 'node_modules' || e.name === '.git')
            continue; // 忽略 node_modules 和 .git
        const full = path.join(dir, e.name); // 计算完整路径
        if (e.isDirectory())
            out.push(...walk(full, filter)); // 目录则递归
        else if (filter(full))
            out.push(full); // 文件且匹配过滤器则加入
    }
    return out; // 返回
}
// 旧 HTML 替换实现删除，统一复用 component.ts 中的实现
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
function processTsFile(tsPath, externalAliases) {
    const before = readFile(tsPath);
    const sf = typescript_1.default.createSourceFile(tsPath, before, typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS);
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
    const htmlBefore = htmlPath && fs.existsSync(htmlPath) ? readFile(htmlPath) : '';
    const { tsOut, htmlOut, aliases } = (0, component_1.processComponent)(before, htmlBefore, tsPath, externalAliases);
    const changedTs = tsOut !== before;
    const changedHtml = htmlPath ? (htmlOut !== htmlBefore) : false;
    if (changedTs)
        writeFile(tsPath, tsOut);
    if (htmlPath && changedHtml)
        writeFile(htmlPath, htmlOut);
    processTsFile._last = { tsBefore: before, tsAfter: tsOut, htmlBefore, htmlAfter: htmlOut };
    return { changed: changedTs || changedHtml, code: tsOut, aliases, htmlPath };
}
exports.processTsFile = processTsFile;
// 旧 HTML 别名收集删除，统一由 component.ts 内部实现
function processHtmlRestore(htmlPath, alias) {
    const before = readFile(htmlPath);
    const after = restoreHtmlContent(before, alias);
    if (after !== before)
        writeFile(htmlPath, after);
    return { changed: after !== before };
}
function ensureAngularFiles(dictDir, mode) {
    const svcPath = path.join(process.cwd(), 'src/app/i18n/index.ts');
    const pipePath = path.join(process.cwd(), 'src/app/i18n/i18n.pipe.ts');
    const hasSvc = fs.existsSync(svcPath);
    const hasPipe = fs.existsSync(pipePath);
    if (!hasSvc && mode === 'fix') {
        const svc = `import { Injectable } from '@angular/core'\nimport { en } from './en'\nimport { zh } from './zh'\n@Injectable({ providedIn: 'root' })\nexport class I18nLocaleService {\n  lang: 'zh'|'en' = 'zh'\n  getLocale() { const cached = localStorage.getItem('i18n-lang'); if (cached) this.lang = cached as any; return this.lang === 'en' ? en as any : zh }\n  get(key: string, params?: Record<string, unknown>) { const pack: any = this.getLocale(); const val = key.split('.').reduce((o,k)=>o?o[k]:undefined, pack); let s = typeof val === 'string' ? val : ''; if (params) { for (const [k,v] of Object.entries(params)) s = s.replace(new RegExp('\\\\{'+k+'\\\\}','g'), String(v)) } return s }\n  setLang(code: 'en'|'zh') { this.lang = code; localStorage.setItem('i18n-lang', code); }\n}`;
        fs.mkdirSync(path.dirname(svcPath), { recursive: true });
        fs.writeFileSync(svcPath, svc, 'utf8');
        (0, logger_1.info)('created service', { file: svcPath });
    }
    else if (!hasSvc)
        (0, logger_1.warn)('missing service', { suggest: 'create src/app/i18n/index.ts' });
    if (!hasPipe && mode === 'fix') {
        const pipe = `import { Pipe, PipeTransform } from '@angular/core'\nimport { I18nLocaleService } from './index'\n@Pipe({ name: 'i18n', standalone: true })\nexport class I18nPipe implements PipeTransform { constructor(private locale: I18nLocaleService){} transform(key: string, params?: Record<string, unknown>) { return this.locale.get(key, params) } }`;
        fs.mkdirSync(path.dirname(pipePath), { recursive: true });
        fs.writeFileSync(pipePath, pipe, 'utf8');
        (0, logger_1.info)('created pipe', { file: pipePath });
    }
    else if (!hasPipe)
        (0, logger_1.warn)('missing pipe', { suggest: 'create src/app/i18n/i18n.pipe.ts' });
    const appComp = path.join(process.cwd(), 'src/app/app.component.ts');
    if (fs.existsSync(appComp)) {
        let s = readFile(appComp);
        if (!/I18nPipe/.test(s)) {
            if (mode === 'fix') {
                const lastImport = s.lastIndexOf('import ');
                const eol = s.indexOf('\n', lastImport);
                if (eol >= 0)
                    s = s.slice(0, eol + 1) + `import { I18nPipe } from './i18n/i18n.pipe'\n` + s.slice(eol + 1);
                s = s.replace(/imports:\s*\[([^\]]*)\]/, (_m, inside) => `imports: [${inside} , I18nPipe]`);
                writeFile(appComp, s);
                (0, logger_1.info)('imported pipe globally', { file: appComp });
            }
            else
                (0, logger_1.warn)('pipe not globally imported', { file: appComp });
        }
    }
}
exports.ensureAngularFiles = ensureAngularFiles;
function emitJson(dictDir, outDir, langs, arrayMode) {
    for (const lang of langs) {
        const fp = path.join(process.cwd(), dictDir, `${lang}.ts`);
        if (!fs.existsSync(fp)) {
            (0, logger_1.warn)('lang file missing', { file: fp });
            continue;
        }
        const flat = (0, dict_flatten_1.flattenLangFile)(fp, arrayMode);
        (0, dict_flatten_1.writeJson)(path.isAbsolute(outDir) ? outDir : path.join(process.cwd(), outDir), lang, flat);
        (0, logger_1.info)('json emitted', { lang, keys: Object.keys(flat).length });
    }
}
exports.emitJson = emitJson;
function splitLines(s) { return String(s || '').split(/\r?\n/); }
function diffLines(a, b) {
    var _a, _b;
    const la = splitLines(a), lb = splitLines(b);
    const n = Math.max(la.length, lb.length);
    const out = [];
    for (let i = 0; i < n; i++) {
        const ba = (_a = la[i]) !== null && _a !== void 0 ? _a : '', bb = (_b = lb[i]) !== null && _b !== void 0 ? _b : '';
        if (ba !== bb)
            out.push({ line: i + 1, before: ba, after: bb });
    }
    return out;
}
function pickKeyCandidate(union, raw) {
    const r = String(raw || '').replace(/\.$/, '');
    if (!r)
        return null;
    const parts = r.split('.');
    const last = parts[parts.length - 1];
    const base = parts.length > 1 ? parts[0] : '';
    const cands = [];
    for (const k of union) {
        if (k.endsWith(`.${last}`) || k === last || (base && k.startsWith(`${base}.`) && k.includes(`.${last}`)))
            cands.push(k);
    }
    cands.sort((a, b) => a.length - b.length);
    return cands[0] || null;
}
function extractKeys(line, type) {
    const s = String(line || '');
    if (type === 'ts') {
        // Detect new key from get('key')
        const n = s.match(/this\.[A-Za-z_]\w*\.get\(\s*['"]([A-Za-z0-9_.]+)['"]/);
        // Detect old key from getLocale/getLocal(...).path
        const oLocal = s.match(/this\.[A-Za-z_]\w*\.(?:getLocale|getLocal)\([^)]*\)\.([A-Za-z0-9_.]+)/);
        // Detect old key from property chain followed by replace(...) calls
        const oReplace = s.match(/this\.[A-Za-z_]\w*\.([A-Za-z0-9_.]+)(?=\.replace\()/);
        // Detect old key from indexed literal access: this.alias.base['lit'] -> base.lit
        const oIndexLit = s.match(/this\.[A-Za-z_]\w*\.([A-Za-z0-9_.]+)\s*\[\s*['"]([^'"]+)['"]\s*\]/);
        // Fallback: plain property chain without trailing call
        const oPlain = s.match(/this\.[A-Za-z_]\w*\.([A-Za-z0-9_.]+)(?!\s*\()/);
        const oldKey = oIndexLit ? `${oIndexLit[1]}.${oIndexLit[2]}` : (oLocal && oLocal[1]) || (oReplace && oReplace[1]) || (oPlain && oPlain[1]) || null;
        return { oldKey, newKey: n && n[1] || null };
    }
    else {
        const n = s.match(/\{\{\s*['"]([A-Za-z0-9_.]+)['"]\s*\|\s*i18n/);
        // Plain interpolation: {{ alias.path }}
        const oPlain = s.match(/\{\{\s*[A-Za-z_]\w*\.([A-Za-z0-9_.]+)\s*\}\}/);
        // Indexed literal: {{ alias.base['lit'] }}
        const oIndexLit = s.match(/\{\{\s*[A-Za-z_]\w*\.([A-Za-z0-9_.]+)\s*\[\s*['"]([^'"]+)['"]\s*\]\s*\}\}/);
        // Replace chain: {{ alias.path.replace(...).replace(...)}}
        const oReplace = s.match(/\{\{\s*[A-Za-z_]\w*\.([A-Za-z0-9_.]+)\s*(?:\.replace\([^)]*\))+\s*\}\}/);
        const oldKey = oIndexLit ? `${oIndexLit[1]}.${oIndexLit[2]}` : (oReplace && oReplace[1]) || (oPlain && oPlain[1]) || null;
        return { oldKey, newKey: n && n[1] || null };
    }
}
function valueOf(map, key) {
    if (!key)
        return null;
    const v = map[key];
    if (v === undefined)
        return null;
    return Array.isArray(v) ? JSON.stringify(v) : String(v);
}
function main() {
    const args = process.argv.slice(2); // 读取参数
    let mode = 'replace';
    const usage = `Usage: i18n-refactor [init | --mode=replace|restore|bootstrap|delete|init] [--help] [--version]`;
    const version = '0.2.0';
    for (const a of args) { // 解析参数
        if (a === 'init')
            mode = 'init';
        const r = a.match(/^--mode=(replace|restore|bootstrap|delete|init)$/);
        if (r)
            mode = r[1];
        if (a === '--dry-run')
            dryRun = true;
        if (a === '--help') {
            process.stdout.write(usage + '\n');
            return;
        }
        if (a === '--version') {
            process.stdout.write(version + '\n');
            return;
        }
    }
    dryRun = !!config_1.config.dryRun;
    (0, logger_1.configureLogger)({ level: config_1.config.logLevel, format: (config_1.config.format === 'json' || config_1.config.format === 'pretty' ? config_1.config.format : 'pretty') });
    (0, dict_reader_1.setDictDir)(config_1.config.dictDir || 'src/app/i18n');
    (0, logger_1.info)('start', { dir: config_1.config.dir, mode, dryRun });
    if (mode === 'init') {
        const merged = (0, config_1.loadConfig)();
        const fp = path.join(process.cwd(), 'omrp.config.json');
        fs.writeFileSync(fp, JSON.stringify(merged, null, 2) + '\n', 'utf8');
        (0, logger_1.info)('config initialized', { file: fp });
        return;
    }
    if (mode === 'bootstrap') {
        ensureAngularFiles(config_1.config.dictDir || 'src/app/i18n', (config_1.config.ensureAngular || 'fix'));
        emitJson(config_1.config.dictDir || 'src/app/i18n', (config_1.config.jsonOutDir || 'i18n-refactor/out'), (config_1.config.languages || ['zh', 'en']), (config_1.config.jsonArrayMode || 'nested'));
        return;
    }
    const dir = config_1.config.dir || process.cwd();
    const tsFiles = walk(dir, p => p.endsWith('.ts')); // 收集 TS 文件
    const externalAliases = new Map();
    if (mode !== 'delete') {
        (0, logger_1.info)('scanning aliases', { count: tsFiles.length });
        for (const f of tsFiles) {
            const src = readFile(f);
            const sf = typescript_1.default.createSourceFile(f, src, typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS);
            let className = '';
            let serviceName = '';
            const visit = (node) => {
                if (typescript_1.default.isClassDeclaration(node) && node.name) {
                    className = node.name.text;
                    for (const m of node.members) {
                        if (typescript_1.default.isConstructorDeclaration(m)) {
                            for (const p of m.parameters) {
                                if (p.type && typescript_1.default.isTypeReferenceNode(p.type) && typescript_1.default.isIdentifier(p.type.typeName) && p.type.typeName.text === config_1.config.serviceTypeName) {
                                    if (typescript_1.default.isIdentifier(p.name))
                                        serviceName = p.name.text;
                                }
                            }
                        }
                    }
                }
                typescript_1.default.forEachChild(node, visit);
            };
            visit(sf);
            if (className && serviceName) {
                const aliases = (0, var_alias_1.collectVarAliases)(sf, serviceName, config_1.config.getLocalMethod);
                if (aliases.length) {
                    console.log(`[DEBUG] Found aliases in ${className}:`, aliases);
                    externalAliases.set(className, aliases);
                }
            }
        }
        console.log('[DEBUG] External aliases map keys:', Array.from(externalAliases.keys()));
        if (externalAliases.size > 0) {
            for (const [k, v] of externalAliases) {
                console.log(`[DEBUG] External Alias ${k}:`, v.map(a => `${a.name}->${a.prefix}`));
            }
        }
    }
    const results = []; // 结果列表
    const langs = (config_1.config.languages || ['zh', 'en']);
    const dictDir = config_1.config.dictDir || 'src/app/i18n';
    const arrayMode = (config_1.config.jsonArrayMode || 'nested');
    const zhMap = fs.existsSync(path.join(process.cwd(), dictDir, 'zh.ts')) ? (0, dict_flatten_1.flattenLangFile)(path.join(process.cwd(), dictDir, 'zh.ts'), arrayMode) : {};
    const enMap = fs.existsSync(path.join(process.cwd(), dictDir, 'en.ts')) ? (0, dict_flatten_1.flattenLangFile)(path.join(process.cwd(), dictDir, 'en.ts'), arrayMode) : {};
    const unionKeys = Array.from(new Set([...Object.keys(zhMap), ...Object.keys(enMap)]));
    const details = [];
    for (const f of tsFiles) { // 遍历 TS
        if (mode === 'delete') {
            const before = readFile(f);
            const { code: after, deleted } = (0, prune_1.pruneUnused)(typescript_1.default.createSourceFile(f, before, typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS), before, []);
            const changedTs = after !== before;
            if (changedTs)
                writeFile(f, after);
            results.push({ file: f, type: 'ts', changed: changedTs, deleted: (deleted === null || deleted === void 0 ? void 0 : deleted.length) ? deleted : undefined });
            const tsDiff = diffLines(before, after);
            const tsChanges = tsDiff.map(d => {
                const ks = extractKeys(d.before, 'ts');
                const ks2 = extractKeys(d.after, 'ts');
                const bk = ks.oldKey ? pickKeyCandidate(unionKeys, ks.oldKey) : null;
                const ak = ks2.newKey || (ks2.oldKey ? pickKeyCandidate(unionKeys, ks2.oldKey) : null);
                return {
                    line: d.line,
                    before: d.before,
                    after: d.after,
                    beforeKey: bk,
                    afterKey: ak,
                    zhBefore: valueOf(zhMap, bk),
                    enBefore: valueOf(enMap, bk),
                    zhAfter: valueOf(zhMap, ak),
                    enAfter: valueOf(enMap, ak)
                };
            });
            if (tsChanges.length || (deleted && deleted.length))
                details.push({ file: f, type: 'ts', changes: tsChanges, deleted });
        }
        else {
            const r = processTsFile(f, externalAliases); // 处理 TS 文件
            let deleted;
            if (dryRun) {
                const dummySf = typescript_1.default.createSourceFile(f, r.code, typescript_1.default.ScriptTarget.Latest, true);
                const res = (0, prune_1.pruneUnused)(dummySf, r.code, r.aliases);
                deleted = res.deleted;
            }
            results.push({ file: f, type: 'ts', changed: r.changed, deleted: (deleted === null || deleted === void 0 ? void 0 : deleted.length) ? deleted : undefined }); // 记录结果
            const last = processTsFile._last || {};
            const tsDiff = diffLines(last.tsBefore || '', last.tsAfter || '');
            const tsChanges = tsDiff.map(d => {
                const ks = extractKeys(d.before, 'ts');
                const ks2 = extractKeys(d.after, 'ts');
                const bk = ks.oldKey ? pickKeyCandidate(unionKeys, ks.oldKey) : null;
                const ak = ks2.newKey || (ks2.oldKey ? pickKeyCandidate(unionKeys, ks2.oldKey) : null);
                return {
                    line: d.line,
                    before: d.before,
                    after: d.after,
                    beforeKey: bk,
                    afterKey: ak,
                    zhBefore: valueOf(zhMap, bk),
                    enBefore: valueOf(enMap, bk),
                    zhAfter: valueOf(zhMap, ak),
                    enAfter: valueOf(enMap, ak)
                };
            });
            if (tsChanges.length || (deleted && deleted.length))
                details.push({ file: f, type: 'ts', changes: tsChanges, deleted });
            if (r.htmlPath && fs.existsSync(r.htmlPath)) { // 若关联模板存在
                if (mode === 'restore') {
                    const hr = processHtmlRestore(r.htmlPath, 'i18n');
                    results.push({ file: r.htmlPath, type: 'html', changed: hr.changed });
                    const htmlLastBefore = last.htmlBefore || '';
                    const htmlLastAfter = restoreHtmlContent(htmlLastBefore, 'i18n');
                    const htmlDiff = diffLines(htmlLastBefore, htmlLastAfter);
                    const htmlChanges = htmlDiff.map(d => {
                        const ks = extractKeys(d.before, 'html');
                        const ks2 = extractKeys(d.after, 'html');
                        const bk = ks.oldKey ? pickKeyCandidate(unionKeys, ks.oldKey) : null;
                        const ak = ks2.newKey || (ks2.oldKey ? pickKeyCandidate(unionKeys, ks2.oldKey) : null);
                        return {
                            line: d.line,
                            before: d.before,
                            after: d.after,
                            beforeKey: bk,
                            afterKey: ak,
                            zhBefore: valueOf(zhMap, bk),
                            enBefore: valueOf(enMap, bk),
                            zhAfter: valueOf(zhMap, ak),
                            enAfter: valueOf(enMap, ak)
                        };
                    });
                    if (htmlChanges.length)
                        details.push({ file: r.htmlPath, type: 'html', changes: htmlChanges });
                }
                else {
                    const htmlDiff = diffLines(last.htmlBefore || '', last.htmlAfter || '');
                    const htmlChanges = htmlDiff.map(d => {
                        const ks = extractKeys(d.before, 'html');
                        const ks2 = extractKeys(d.after, 'html');
                        const bk = ks.oldKey ? pickKeyCandidate(unionKeys, ks.oldKey) : null;
                        const ak = ks2.newKey || (ks2.oldKey ? pickKeyCandidate(unionKeys, ks2.oldKey) : null);
                        return {
                            line: d.line,
                            before: d.before,
                            after: d.after,
                            beforeKey: bk,
                            afterKey: ak,
                            zhBefore: valueOf(zhMap, bk),
                            enBefore: valueOf(enMap, bk),
                            zhAfter: valueOf(zhMap, ak),
                            enAfter: valueOf(enMap, ak)
                        };
                    });
                    if (htmlChanges.length)
                        details.push({ file: r.htmlPath, type: 'html', changes: htmlChanges });
                }
            }
        }
    }
    const changed = results.filter(r => r.changed).length; // 统计变更数
    const summary = { dir, files: results.length, changed, missingKeys: missingKeyCount }; // 汇总信息
    if ((config_1.config.format || 'json') === 'json')
        process.stdout.write(JSON.stringify({ summary, results, details }, null, 2) + '\n');
    else {
        (0, logger_1.info)('summary', summary);
        for (const r of results)
            (0, logger_1.info)('result', r);
    }
    // Always generate HTML report
    const outDir = path.isAbsolute((config_1.config.jsonOutDir || 'i18n-refactor/out')) ? config_1.config.jsonOutDir : path.join(process.cwd(), (config_1.config.jsonOutDir || 'i18n-refactor/out'));
    fs.mkdirSync(outDir, { recursive: true });
    const html = renderHtmlReport(summary, results, details);
    const fp = path.join(outDir, 'report.html');
    fs.writeFileSync(fp, html, 'utf8');
    (0, logger_1.info)('html report written', { file: fp });
}
exports.main = main;
if (require.main === module) {
}
if (require.main === module) {
    main();
}
function escapeHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function renderHtmlReport(summary, results, details) {
    const head = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>I18n Refactor Report</title><style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:24px;background:#fafafa;color:#222}
.summary{display:flex;gap:16px;margin-bottom:20px}
.card{background:#fff;border:1px solid #eee;border-radius:8px;padding:12px 16px;box-shadow:0 1px 2px rgba(0,0,0,0.04)}
.card h3{margin:0 0 6px;font-size:14px;color:#555}
.card .num{font-size:20px;font-weight:600}
.files{margin:16px 0}
.file{margin:16px 0;padding:12px;border:1px solid #eee;background:#fff;border-radius:8px}
.file h4{margin:0 0 10px;font-size:14px;color:#333}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #eee;padding:8px;text-align:left;vertical-align:top;font-size:13px}
th{background:#f6f6f6}
.changed{color:#0a7; font-weight:600}
.unchanged{color:#999}
.mono{font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace}
.key{background:#f0f7ff;border-radius:4px;padding:2px 6px}
.section-title{margin-top:28px;margin-bottom:8px;font-size:15px}
</style></head><body>`;
    const sum = `<div class="summary">
    <div class="card"><h3>Directory</h3><div class="num mono">${escapeHtml(summary.dir)}</div></div>
    <div class="card"><h3>Total Files</h3><div class="num">${summary.files}</div></div>
    <div class="card"><h3>Changed Files</h3><div class="num">${summary.changed}</div></div>
    <div class="card"><h3>Missing Keys</h3><div class="num">${summary.missingKeys}</div></div>
  </div>`;
    const list = `<div class="files"><div class="section-title">Files</div><table><thead><tr><th>File</th><th>Type</th><th>Status</th></tr></thead><tbody>${results.map(r => { var _a; return `<tr><td class="mono">${escapeHtml(r.file)}</td><td>${r.type}</td><td>${r.changed ? '<span class="changed">changed</span>' : '<span class="unchanged">unchanged</span>'}${((_a = r.deleted) === null || _a === void 0 ? void 0 : _a.length) ? ' <span style="color:#c00;font-size:12px;font-weight:600">(has deletions)</span>' : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
    const detailHtml = details.map(d => {
        const deletedHtml = d.deleted && d.deleted.length ?
            `<div style="margin-bottom:10px;padding:8px;background:#fff5f5;border:1px solid #ffcccc;border-radius:4px">
         <h5 style="margin:0 0 4px;color:#c00;font-size:13px">Deleted Items:</h5>
         <ul style="margin:0;padding-left:20px;color:#a00;font-size:13px">${d.deleted.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
       </div>` : '';
        const rows = d.changes.map(c => `<tr>
      <td>${c.line}</td>
      <td class="mono">${escapeHtml(c.before)}</td>
      <td class="mono">${escapeHtml(c.after)}</td>
      <td>${c.beforeKey ? `<span class="key mono">${escapeHtml(c.beforeKey)}</span>` : ''}<div class="mono" style="color:#666">${escapeHtml(c.zhBefore || '')}</div><div class="mono" style="color:#666">${escapeHtml(c.enBefore || '')}</div></td>
      <td>${c.afterKey ? `<span class="key mono">${escapeHtml(c.afterKey)}</span>` : ''}<div class="mono" style="color:#666">${escapeHtml(c.zhAfter || '')}</div><div class="mono" style="color:#666">${escapeHtml(c.enAfter || '')}</div></td>
    </tr>`).join('');
        return `<div class="file"><h4>${escapeHtml(d.file)} <span style="color:#999">(${d.type})</span></h4>
      ${deletedHtml}
      <table>
        <thead><tr><th>Line</th><th>Before</th><th>After</th><th>Original Key & Value</th><th>Replaced Key & Value</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
    }).join('');
    const tail = `</body></html>`;
    return head + sum + list + `<div class="section-title">Changes</div>` + detailHtml + tail;
}
function writeHtmlReportForTest(outDir, summary, results, details) {
    fs.mkdirSync(outDir, { recursive: true });
    const html = renderHtmlReport(summary, results, details);
    const fp = path.join(outDir, 'report.html');
    fs.writeFileSync(fp, html, 'utf8');
    return fp;
}
exports.writeHtmlReportForTest = writeHtmlReportForTest;
