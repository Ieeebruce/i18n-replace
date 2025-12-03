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
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const params_extractor_1 = require("../core/params-extractor");
const prune_1 = require("../replace/prune");
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
function replaceHtmlContent(src) {
    let s = src;
    // 链式模板替换：{{ var.key.replace('{a}', x).replace('{b}', y) }} → {{ 'key' | i18n: {a:x,b:y} }}
    s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)((?:\.replace\([^)]*\))+)[^}]*\}\}/g, (_m, _var, key, chain) => {
        const params = (0, params_extractor_1.extractReplaceParams)(chain);
        const p = Object.keys(params).length ? `: ${JSON.stringify(params)}` : '';
        return `{{ '${key}' | i18n${p} }}`;
    });
    // 索引字面量：{{ var.key['x'] }} 或 {{ var.key["x"] }}
    s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)\s*\[(['"])([^'\"]+)\3\]\s*\}\}/g, (_m, _v, base, _q, lit) => {
        return `{{ '${base}.${lit}' | i18n }}`;
    });
    // 索引动态表达式：{{ var.key[idx] }} → {{ ('key.' + idx) | i18n }}
    s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)\s*\[([^\]]+)\]\s*\}\}/g, (_m, _v, base, expr) => {
        return `{{ ('${base}.' + ${expr.trim()}) | i18n }}`;
    });
    // 简单属性：{{ var.key }} → {{ 'key' | i18n }}
    s = s.replace(/\{\{\s*([A-Za-z_]\w*)\.([A-Za-z0-9_.]+)\s*\}\}/g, (_m, _v, key) => {
        return `{{ '${key}' | i18n }}`;
    });
    return s;
}
function collectGetLocalVars(tsCode) {
    const names = new Set();
    const re = /this\.([A-Za-z_]\w*)\s*=\s*[^;]*\.getLocal\([^)]*\)/g;
    let m;
    while ((m = re.exec(tsCode)))
        names.add(m[1]);
    return Array.from(names);
}
function processTsFile(tsPath) {
    const before = readFile(tsPath);
    const varNames = collectGetLocalVars(before);
    const after = (0, prune_1.pruneUnused)({}, before, varNames);
    if (after !== before)
        writeFile(tsPath, after);
    return { changed: after !== before };
}
function processHtmlFile(htmlPath) {
    const before = readFile(htmlPath);
    const after = replaceHtmlContent(before);
    if (after !== before)
        writeFile(htmlPath, after);
    return { changed: after !== before };
}
function main() {
    const args = process.argv.slice(2);
    let dir = process.cwd();
    for (const a of args) {
        const m = a.match(/^--dir=(.+)$/);
        if (m)
            dir = path.isAbsolute(m[1]) ? m[1] : path.join(process.cwd(), m[1]);
    }
    const tsFiles = walk(dir, p => p.endsWith('.ts'));
    const htmlFiles = walk(dir, p => p.endsWith('.html'));
    const results = [];
    for (const f of tsFiles) {
        const r = processTsFile(f);
        results.push({ file: f, type: 'ts', changed: r.changed });
    }
    for (const f of htmlFiles) {
        const r = processHtmlFile(f);
        results.push({ file: f, type: 'html', changed: r.changed });
    }
    const changed = results.filter(r => r.changed).length;
    const summary = { dir, files: results.length, changed };
    process.stdout.write(JSON.stringify({ summary, results }, null, 2) + '\n');
}
main();
