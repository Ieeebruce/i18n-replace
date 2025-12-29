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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const typescript_1 = __importDefault(require("typescript"));
const config_1 = require("../core/config");
const logger_1 = require("../util/logger");
const dict_reader_1 = require("../util/dict-reader");
const component_1 = require("./component");
const mode_dispatcher_1 = require("./mode-dispatcher");
function readFile(p) { return fs.readFileSync(p, 'utf8'); } // 读取文本文件
let dryRun = !!config_1.config.dryRun; // 干运行，从配置读取
function writeFile(p, s) { if (!dryRun)
    fs.writeFileSync(p, s, 'utf8'); } // 写出文本文件（支持 dry-run）
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
    if (htmlPath && changedHtml) {
        writeFile(htmlPath, htmlOut);
    }
    processTsFile._last = { tsBefore: before, tsAfter: tsOut, htmlBefore, htmlAfter: htmlOut };
    return { changed: changedTs || changedHtml, code: tsOut, aliases, htmlPath, complexCases };
}
exports.processTsFile = processTsFile;
function main() {
    const args = process.argv.slice(2); // 读取参数
    let mode = 'replace';
    const usage = `Usage: i18n-refactor [--mode=replace|delete|dict-process|inject-i18n] [--help] [--version]`;
    const version = '0.2.0';
    for (const a of args) { // 解析参数
        const r = a.match(/^--mode=(replace|delete|dict-process|inject-i18n)$/);
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
    // 分发模式处理
    (0, mode_dispatcher_1.dispatchMode)(mode);
}
main();
