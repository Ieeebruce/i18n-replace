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
const config_1 = require("../core/config"); // 统一配置（固定从 omrp.config.json 加载）
const logger_1 = require("../util/logger"); // 日志
const dict_reader_1 = require("../util/dict-reader"); // 设置字典目录（用于 pickRoot/hasKey 等工具）
const component_1 = require("./component"); // 复用 UT 使用的组件处理逻辑
const dict_flatten_1 = require("../util/dict-flatten");
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
function processTsFile(tsPath) {
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
    const { tsOut, htmlOut } = (0, component_1.processComponent)(before, htmlBefore, tsPath);
    const changedTs = tsOut !== before;
    const changedHtml = htmlPath ? (htmlOut !== htmlBefore) : false;
    if (changedTs)
        writeFile(tsPath, tsOut);
    if (htmlPath && changedHtml)
        writeFile(htmlPath, htmlOut);
    const aliases = [];
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
function main() {
    const args = process.argv.slice(2); // 读取参数
    let mode = 'replace'; // 默认模式
    const usage = `Usage: i18n-refactor [--mode=replace|restore|bootstrap] [--help] [--version]`;
    const version = '0.2.0';
    for (const a of args) { // 解析参数
        const r = a.match(/^--mode=(replace|restore|bootstrap)$/);
        if (r)
            mode = r[1];
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
    (0, logger_1.configureLogger)({ level: config_1.config.logLevel, format: config_1.config.format });
    (0, dict_reader_1.setDictDir)(config_1.config.dictDir || 'src/app/i18n');
    (0, logger_1.info)('start', { dir: config_1.config.dir, mode, dryRun });
    if (mode === 'bootstrap') {
        ensureAngularFiles(config_1.config.dictDir || 'src/app/i18n', (config_1.config.ensureAngular || 'fix'));
        emitJson(config_1.config.dictDir || 'src/app/i18n', (config_1.config.jsonOutDir || 'i18n-refactor/out'), (config_1.config.languages || ['zh', 'en']), (config_1.config.jsonArrayMode || 'nested'));
        return;
    }
    const dir = config_1.config.dir || process.cwd();
    const tsFiles = walk(dir, p => p.endsWith('.ts')); // 收集 TS 文件
    const results = []; // 结果列表
    for (const f of tsFiles) { // 遍历 TS
        const r = processTsFile(f); // 处理 TS 文件
        results.push({ file: f, type: 'ts', changed: r.changed }); // 记录结果
        if (r.htmlPath && fs.existsSync(r.htmlPath)) { // 若关联模板存在
            if (mode === 'restore') {
                const hr = processHtmlRestore(r.htmlPath, 'i18n');
                results.push({ file: r.htmlPath, type: 'html', changed: hr.changed });
            }
        }
    }
    const changed = results.filter(r => r.changed).length; // 统计变更数
    const summary = { dir, files: results.length, changed, missingKeys: missingKeyCount }; // 汇总信息
    if ((config_1.config.format || 'json') === 'json')
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
