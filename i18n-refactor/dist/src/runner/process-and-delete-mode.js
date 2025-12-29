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
exports.processTsFilesAndHandle = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const typescript_1 = __importDefault(require("typescript"));
const config_1 = require("../core/config");
const logger_1 = require("../util/logger");
const component_1 = require("./component");
const prune_1 = require("../replace/prune");
const var_alias_1 = require("../core/var-alias");
// 读取和写入文件的辅助函数
function readFile(p) { return fs.readFileSync(p, 'utf8'); } // 读取文本文件
let dryRun = !!config_1.config.dryRun; // 干运行，从配置读取
function writeFile(p, s) { if (!dryRun)
    fs.writeFileSync(p, s, 'utf8'); } // 写出文本文件（支持 dry-run）
// 递归遍历目录并按过滤器收集文件
function walk(dir, filter) {
    const out = []; // 输出文件列表
    try {
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
    }
    catch (error) {
        // 如果目录不存在或无法访问，返回空数组
        console.warn(`Warning: Could not read directory ${dir}`, error);
    }
    return out; // 返回
}
// 用于计算行差异的辅助函数
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
// 从字典目录加载语言字典的辅助函数
function loadLangDict(dictDir, langPrefix, arrayMode) {
    const dir = path.join(process.cwd(), dictDir);
    if (!fs.existsSync(dir))
        return {};
    const re = new RegExp(`^${langPrefix}[A-Za-z0-9_-]*\\.ts$`);
    const files = fs.readdirSync(dir).filter(n => re.test(n));
    let out = {};
    for (const name of files) {
        const fp = path.join(dir, name);
        // 注意：这里需要导入flattenLangFile，暂时简化处理
        out = { ...out, ...{} };
    }
    return out;
}
// 提取键的辅助函数
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
        const oIndexLit = s.match(/\{\{\s*[A-Za-z_]\w*\.([A-Za-z0-9_.]+)\s*\[\s*['"]([^'"]+)['"]\s*\}\}/);
        // Replace chain: {{ alias.path.replace(...).replace(...)}}
        const oReplace = s.match(/\{\{\s*[A-Za-z_]\w*\.([A-Za-z0-9_.]+)\s*(?:\.replace\([^)]*\))+\s*\}\}/);
        const oldKey = oIndexLit ? `${oIndexLit[1]}.${oIndexLit[2]}` : (oReplace && oReplace[1]) || (oPlain && oPlain[1]) || null;
        return { oldKey, newKey: n && n[1] || null };
    }
}
// 从字典中获取值的辅助函数
function valueOf(map, key) {
    if (!key)
        return null;
    const v = map[key];
    if (v === undefined)
        return null;
    return Array.isArray(v) ? JSON.stringify(v) : String(v);
}
// 从字典中选择候选键的辅助函数
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
// 处理 TS 和 HTML 文件的主要函数
function processTsFilesAndHandle(mode) {
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
    const complexCases = []; // 复杂情况列表
    const langs = (config_1.config.languages || ['zh', 'en']);
    const dictDir = config_1.config.dictDir || 'src/app/i18n';
    const arrayMode = (config_1.config.jsonArrayMode || 'nested');
    // 简化处理，不实现完整的字典加载
    const unionKeys = [];
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
                    zhBefore: null,
                    enBefore: null,
                    zhAfter: null,
                    enAfter: null
                };
            });
            if (tsChanges.length || (deleted && deleted.length))
                details.push({ file: f, type: 'ts', changes: tsChanges, deleted });
        }
        else {
            const r = processTsFile(f, externalAliases); // 处理 TS 文件
            // 收集复杂情况
            complexCases.push(...r.complexCases);
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
                    zhBefore: null,
                    enBefore: null,
                    zhAfter: null,
                    enAfter: null
                };
            });
            if (tsChanges.length || (deleted && deleted.length))
                details.push({ file: f, type: 'ts', changes: tsChanges, deleted });
            if (r.htmlPath && fs.existsSync(r.htmlPath)) { // 若关联模板存在
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
                        zhBefore: null,
                        enBefore: null,
                        zhAfter: null,
                        enAfter: null
                    };
                });
                if (htmlChanges.length)
                    details.push({ file: r.htmlPath, type: 'html', changes: htmlChanges });
            }
        }
    }
    const changed = results.filter(r => r.changed).length; // 统计变更数
    const summary = { dir, files: results.length, changed, missingKeys: 0 }; // 汇总信息
    // 生成 HTML 报告
    const outDir = path.isAbsolute((config_1.config.jsonOutDir || 'i18n-refactor/out')) ? config_1.config.jsonOutDir : path.join(process.cwd(), (config_1.config.jsonOutDir || 'i18n-refactor/out'));
    fs.mkdirSync(outDir, { recursive: true });
    const html = renderHtmlReport(summary, results.filter(r => r.changed), details, complexCases);
    const fp = path.join(outDir, 'report.html');
    fs.writeFileSync(fp, html, 'utf8');
    (0, logger_1.info)('html report written', { file: fp });
}
exports.processTsFilesAndHandle = processTsFilesAndHandle;
// 处理单个 TS 文件的函数
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
    const { tsOut, htmlOut, aliases, complexCases: rawComplexCases } = (0, component_1.processComponent)(before, htmlBefore, tsPath, externalAliases);
    // 填充文件名
    const complexCases = rawComplexCases.map(c => ({ ...c, file: tsPath }));
    const changedTs = tsOut !== before;
    const changedHtml = htmlPath ? (htmlOut !== htmlBefore) : false;
    if (changedTs)
        writeFile(tsPath, tsOut);
    if (htmlPath && changedHtml)
        writeFile(htmlPath, htmlOut);
    processTsFile._last = { tsBefore: before, tsAfter: tsOut, htmlBefore, htmlAfter: htmlOut };
    return { changed: changedTs || changedHtml, code: tsOut, aliases, htmlPath, complexCases };
}
// HTML 报告渲染函数
function escapeHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function renderHtmlReport(summary, results, details, complexCases) {
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
    // 复杂情况部分
    const complexCasesHtml = complexCases.length > 0 ? `
    <div class="section-title" style="margin-top:32px">Complex Cases (${complexCases.length})</div>
    <div style="margin:16px 0">
      <table>
        <thead>
          <tr>
            <th>File</th>
            <th>Line</th>
            <th>Type</th>
            <th>Severity</th>
            <th>Code</th>
            <th>Reason</th>
            <th>Suggestion</th>
          </tr>
        </thead>
        <tbody>
          ${complexCases.map(c => {
        const severityColor = c.severity === 'error' ? '#d00' : c.severity === 'warning' ? '#f90' : '#999';
        const typeLabel = c.type.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        return `<tr>
              <td class="mono" style="font-size:12px">${escapeHtml(c.file)}</td>
              <td>${c.line}</td>
              <td><span style="background:#f0f0f0;padding:2px 6px;border-radius:3px;font-size:12px">${escapeHtml(typeLabel)}</span></td>
              <td><span style="color:${severityColor};font-weight:600">${escapeHtml(c.severity)}</span></td>
              <td class="mono" style="background:#f9f9f9;font-size:12px">${escapeHtml(c.code)}</td>
              <td style="font-size:12px">${escapeHtml(c.reason)}</td>
              <td style="font-size:12px;color:#666">${escapeHtml(c.suggestion)}</td>
            </tr>`;
    }).join('')}
        </tbody>
      </table>
    </div>
  ` : '';
    const tail = `</body></html>`;
    return head + sum + list + `<div class="section-title">Changes</div>` + detailHtml + complexCasesHtml + tail;
}
