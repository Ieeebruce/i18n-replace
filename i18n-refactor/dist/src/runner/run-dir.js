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
exports.writeHtmlReportForTest = exports.main = exports.processDictFiles = exports.emitJson = exports.ensureAngularFiles = exports.injectNgxTranslate = exports.processTsFile = void 0;
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
exports.processTsFile = processTsFile;
// 旧 HTML 别名收集删除，统一由 component.ts 内部实现
function processHtmlRestore(htmlPath, alias) {
    const before = readFile(htmlPath);
    const after = restoreHtmlContent(before, alias);
    if (after !== before)
        writeFile(htmlPath, after);
    return { changed: after !== before };
}
function checkAndInstallNgxTranslate(mode) {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
        (0, logger_1.warn)('package.json not found', { suggest: 'run from project root' });
        return;
    }
    const packageJson = JSON.parse(readFile(packageJsonPath));
    const hasNgxTranslate = packageJson.dependencies && (packageJson.dependencies['@ngx-translate/core'] ||
        packageJson.devDependencies && packageJson.devDependencies['@ngx-translate/core']);
    if (!hasNgxTranslate) {
        if (mode === 'fix') {
            (0, logger_1.info)('installing @ngx-translate/core', {});
            const { spawnSync } = require('child_process');
            const result = spawnSync('npm', ['install', '@ngx-translate/core'], { stdio: 'inherit' });
            if (result.status !== 0) {
                (0, logger_1.warn)('failed to install @ngx-translate/core', { error: result.error });
            }
            else {
                (0, logger_1.info)('installed @ngx-translate/core', {});
            }
        }
        else {
            (0, logger_1.warn)('missing @ngx-translate/core package', { suggest: 'npm install @ngx-translate/core' });
        }
    }
    else {
        (0, logger_1.info)('@ngx-translate/core already installed', {});
    }
}
function createNgxTranslateService(dictDir, mode) {
    const servicePath = path.join(process.cwd(), 'src/app/core/i18n.service.ts');
    // 确保 core 目录存在
    const coreDir = path.join(process.cwd(), 'src/app/core');
    if (!fs.existsSync(coreDir)) {
        if (mode === 'fix') {
            fs.mkdirSync(coreDir, { recursive: true });
            (0, logger_1.info)('created core directory', { path: coreDir });
        }
        else {
            (0, logger_1.warn)('core directory missing', { suggest: 'create src/app/core' });
            return;
        }
    }
    if (!fs.existsSync(servicePath)) {
        if (mode === 'fix') {
            const serviceContent = `import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

@Injectable({ providedIn: 'root' })
export class I18nService {
  constructor(public translate: TranslateService) {
    // 设置默认语言
    this.translate.setDefaultLang('zh');
    // 尝试从本地存储获取语言设置
    const savedLang = localStorage.getItem('language');
    if (savedLang) {
      this.translate.use(savedLang);
    } else {
      // 检测浏览器语言
      const browserLang = this.translate.getBrowserLang();
      this.translate.use(browserLang?.match(/en|zh/) ? browserLang : 'zh');
    }
  }

  // 切换语言
  setLanguage(lang: string) {
    this.translate.use(lang);
    localStorage.setItem('language', lang);
  }

  // 获取当前语言
  getCurrentLanguage(): string {
    return this.translate.currentLang;
  }

  // 翻译文本
  t(key: string, params?: any): string {
    return this.translate.instant(key, params);
  }

  // 异步翻译文本
  get(key: string, params?: any) {
    return this.translate.get(key, params);
  }
}
`;
            fs.writeFileSync(servicePath, serviceContent, 'utf8');
            (0, logger_1.info)('created i18n service', { file: servicePath });
        }
        else {
            (0, logger_1.warn)('missing i18n service', { suggest: 'create src/app/core/i18n.service.ts' });
        }
    }
    else {
        (0, logger_1.info)('i18n service already exists', { file: servicePath });
    }
}
function modifyAppModule(mode) {
    // 尝试修改 app.config.ts (Angular 17+ 的新配置方式)
    const appConfigPath = path.join(process.cwd(), 'src/app/app.config.ts');
    if (fs.existsSync(appConfigPath)) {
        modifyAppConfig(appConfigPath, mode);
        return;
    }
    // 如果 app.config.ts 不存在，尝试 app.module.ts
    const appModulePath = path.join(process.cwd(), 'src/app/app.module.ts');
    if (fs.existsSync(appModulePath)) {
        modifyAppModuleFile(appModulePath, mode);
    }
    else {
        (0, logger_1.warn)('app config/module not found', { suggest: 'check src/app/app.config.ts or src/app/app.module.ts' });
    }
}
function modifyAppConfig(appConfigPath, mode) {
    let content = readFile(appConfigPath);
    // 检查是否已导入 TranslateModule
    if (!content.includes('@ngx-translate/core')) {
        if (mode === 'fix') {
            // 确保安装了 http-loader 包
            const { spawnSync } = require('child_process');
            spawnSync('npm', ['install', '@ngx-translate/http-loader'], { stdio: 'inherit' });
            // 构建新的内容
            let modifiedContent = content;
            // 1. 添加必要的导入语句
            if (!modifiedContent.includes('import { importProvidersFrom } from')) {
                modifiedContent = `import { importProvidersFrom } from '@angular/core';\n` + modifiedContent;
            }
            if (!modifiedContent.includes('@ngx-translate/core')) {
                modifiedContent = `import { TranslateModule, TranslateLoader } from '@ngx-translate/core';\nimport { TranslateHttpLoader } from '@ngx-translate/http-loader';\n` + modifiedContent;
            }
            if (!modifiedContent.includes('@angular/common/http')) {
                modifiedContent = `import { HttpClient } from '@angular/common/http';\n` + modifiedContent;
            }
            // 2. 添加HttpLoaderFactory函数（如果不存在）
            if (!modifiedContent.includes('HttpLoaderFactory')) {
                modifiedContent += `\n\nexport function HttpLoaderFactory(http: HttpClient) {
  return new TranslateHttpLoader(http);
}\n`;
            }
            // 3. 添加TranslateModule到providers配置
            if (modifiedContent.includes('providers: [')) {
                // 如果providers是数组形式
                if (!modifiedContent.includes('importProvidersFrom(TranslateModule')) {
                    modifiedContent = modifiedContent.replace(/(providers:\s*\[)/, 'providers: [\n    importProvidersFrom(TranslateModule.forRoot({\n      loader: {\n        provide: TranslateLoader,\n        useFactory: HttpLoaderFactory,\n        deps: [HttpClient]\n      }\n    })),\n  ');
                }
            }
            else if (modifiedContent.includes('providers:')) {
                // 如果providers是其他形式，如providers: [...]
                modifiedContent = modifiedContent.replace(/(providers\s*:\s*[[{][\s\S]*?[\]}][\s\n\r]*[,}])/, // 匹配providers: [...] 或 providers: {...} 整个表达式
                (match) => {
                    if (match.includes('importProvidersFrom') && match.includes('TranslateModule')) {
                        // 如果已经包含了TranslateModule配置，跳过
                        return match;
                    }
                    else {
                        // 如果没有importProvidersFrom，添加TranslateModule
                        const trimmedMatch = match.trim();
                        if (trimmedMatch.endsWith(']')) {
                            // 是数组形式
                            return match.replace(/(\[[\s\S]*)/, (arrayPart) => {
                                if (arrayPart.includes('importProvidersFrom(TranslateModule')) {
                                    return arrayPart;
                                }
                                return arrayPart.replace(/(\[)/, '[\n    importProvidersFrom(TranslateModule.forRoot({\n      loader: {\n        provide: TranslateLoader,\n        useFactory: HttpLoaderFactory,\n        deps: [HttpClient]\n      }\n    })),\n  ');
                            });
                        }
                        else {
                            // 是对象或其他形式，需要更复杂的处理
                            return `providers: [
    ...${match.replace(/providers\s*:\s*/, '').replace(/[,{]/, '').trim()},
    importProvidersFrom(TranslateModule.forRoot({
      loader: {
        provide: TranslateLoader,
        useFactory: HttpLoaderFactory,
        deps: [HttpClient]
      }
    }))
  ],
`;
                        }
                    }
                });
            }
            else {
                // 如果没有providers配置，需要添加
                if (modifiedContent.includes('export const appConfig:') || modifiedContent.includes('AppConfig')) {
                    if (!modifiedContent.includes('providers:')) {
                        modifiedContent = modifiedContent.replace(/(export const appConfig:\s*ApplicationConfig\s*=\s*{)/, (match) => {
                            return match + `
  providers: [
    importProvidersFrom(TranslateModule.forRoot({
      loader: {
        provide: TranslateLoader,
        useFactory: HttpLoaderFactory,
        deps: [HttpClient]
      }
    }))
  ],
`;
                        });
                        // 如果上面的替换没有成功，尝试其他可能的模式
                        if (modifiedContent === content) {
                            modifiedContent = modifiedContent.replace(/(appConfig\s*:\s*ApplicationConfig\s*=\s*{)/, (match) => {
                                return match + `
  providers: [
    importProvidersFrom(TranslateModule.forRoot({
      loader: {
        provide: TranslateLoader,
        useFactory: HttpLoaderFactory,
        deps: [HttpClient]
      }
    }))
  ],
`;
                            });
                        }
                    }
                }
            }
            content = modifiedContent;
            writeFile(appConfigPath, content);
            (0, logger_1.info)('modified app.config.ts for ngx-translate', { file: appConfigPath });
        }
        else {
            (0, logger_1.warn)('ngx-translate not configured in app.config.ts', { suggest: 'add TranslateModule to providers' });
        }
    }
    else {
        (0, logger_1.info)('ngx-translate already configured in app.config.ts', { file: appConfigPath });
    }
}
function modifyAppModuleFile(appModulePath, mode) {
    let content = readFile(appModulePath);
    // 检查是否已导入 TranslateModule
    if (!content.includes('@ngx-translate/core')) {
        if (mode === 'fix') {
            // 在文件开头添加导入
            if (!content.includes('@ngx-translate/core')) {
                // 确保安装了 http-loader 包
                if (mode === 'fix') {
                    const { spawnSync } = require('child_process');
                    spawnSync('npm', ['install', '@ngx-translate/http-loader'], { stdio: 'inherit' });
                }
                content = content.replace(/(import\s+\{[^\}]*\}\s+from\s+['"][^'"]*app\/[^'"]*['"];)/, `$1
import { TranslateModule, TranslateLoader } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { HttpClient, HttpClientModule } from '@angular/common/http';\n`);
            }
            // 添加 HttpClient 到 imports（如果还没有）
            if (!content.includes('HttpClientModule')) {
                if (content.includes('imports: [')) {
                    content = content.replace(/(imports:\s*\[)/, 'imports: [\n    HttpClientModule,');
                }
            }
            // 添加 TranslateModule 到 imports
            if (content.includes('imports: [')) {
                content = content.replace(/(imports:\s*\[)/, 'imports: [\n    TranslateModule.forRoot({\n      loader: {\n        provide: TranslateLoader,\n        useFactory: HttpLoaderFactory,\n        deps: [HttpClient]\n      }\n    }),');
            }
            // 添加 HttpLoaderFactory 函数
            if (!content.includes('HttpLoaderFactory')) {
                content += `

export function HttpLoaderFactory(http: HttpClient) {
  return new TranslateHttpLoader(http);
}
`;
            }
            writeFile(appModulePath, content);
            (0, logger_1.info)('modified app.module.ts for ngx-translate', { file: appModulePath });
        }
        else {
            (0, logger_1.warn)('ngx-translate not configured in app.module.ts', { suggest: 'add TranslateModule to imports' });
        }
    }
    else {
        (0, logger_1.info)('ngx-translate already configured in app.module.ts', { file: appModulePath });
    }
}
function injectNgxTranslate(dictDir, mode) {
    // 检查并安装 ngx-translate 包
    checkAndInstallNgxTranslate(mode);
    // 在 app/core 下创建新的 i18nService
    createNgxTranslateService(dictDir, mode);
    // 修改 app.module.ts 注入 TranslateModule
    modifyAppModule(mode);
}
exports.injectNgxTranslate = injectNgxTranslate;
function ensureAngularFiles(dictDir, mode) {
    const svcPath = path.join(process.cwd(), 'src/app/i18n/index.ts');
    const pipePath = path.join(process.cwd(), 'src/app/i18n/i18n.pipe.ts');
    const adapterPath = path.join(process.cwd(), 'src/app/i18n/i18n-adapter.ts');
    const hasSvc = fs.existsSync(svcPath);
    const hasPipe = fs.existsSync(pipePath);
    const hasAdapter = fs.existsSync(adapterPath);
    // 创建国际化适配器服务
    if (!hasAdapter && mode === 'fix') {
        const adapter = `import { Injectable, signal, computed } from '@angular/core';
import { en } from './en';
import { zh } from './zh';

export type ZH = typeof zh;

@Injectable({ providedIn: 'root' })
export class I18nAdapterService {
  private langSignal = signal<'zh' | 'en'>('zh');
  private cacheSignal = signal<any>(null);
  
  // 响应式语言状态
  lang = this.langSignal.asReadonly();
  
  // 响应式词条包
  locale = computed(() => {
    const currentLang = this.langSignal();
    const cachedLang = localStorage.getItem('i18n-lang');
    
    if (cachedLang && ['zh', 'en'].includes(cachedLang)) {
      this.langSignal.set(cachedLang as 'zh' | 'en');
    }
    
    const result = currentLang === 'en' ? en : zh;
    this.cacheSignal.set(result);
    return result;
  });
  
  constructor() {
    // 初始化语言
    const cachedLang = localStorage.getItem('i18n-lang');
    if (cachedLang && ['zh', 'en'].includes(cachedLang)) {
      this.langSignal.set(cachedLang as 'zh' | 'en');
    }
  }
  
  /**
   * 获取当前语言的词条包对象 (兼容旧模式)
   */
  getLocale(): typeof zh {
    const currentLang = this.langSignal();
    return currentLang === 'en' ? en as any : zh;
  }
  
  /**
   * 获取词条 (新模式)
   * @param key 词条键名，如 'app.title'
   * @param params 参数对象，如 { name: '张三', count: 5 }
   */
  get(key: string, params?: Record<string, unknown>): string {
    const pack: any = this.getLocale();
    const val = key.split('.').reduce((o, k) => (o ? o[k] : undefined), pack);
    let s = typeof val === 'string' ? val : '';
    
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), String(v));
      }
    }
    
    return s;
  }
  
  /**
   * 设置语言
   * @param code 语言代码 'zh' | 'en'
   */
  setLang(code: 'en' | 'zh'): void {
    this.langSignal.set(code);
    localStorage.setItem('i18n-lang', code);
    // 注意：在实际应用中，我们可能需要触发更新而不是刷新页面
    // 但在适配器中，为了兼容旧代码，我们保留刷新机制
    // window.location.reload();
  }
  
  /**
   * 检查词条是否存在
   * @param key 词条键名
   */
  hasKey(key: string): boolean {
    const pack: any = this.getLocale();
    const val = key.split('.').reduce((o, k) => (o ? o[k] : undefined), pack);
    return typeof val === 'string';
  }
  
  /**
   * 安全获取词条，如果不存在则返回默认值
   * @param key 词条键名
   * @param defaultValue 默认值
   * @param params 参数对象
   */
  getSafe(key: string, defaultValue: string = '', params?: Record<string, unknown>): string {
    if (this.hasKey(key)) {
      return this.get(key, params);
    }
    return defaultValue;
  }
  
  /**
   * 批量获取词条对象
   * @param keys 词条键名数组
   */
  getMultiple(keys: string[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (const key of keys) {
      result[key] = this.get(key);
    }
    return result;
  }
  
  /**
   * 获取当前语言代码
   */
  getCurrentLang(): 'zh' | 'en' {
    return this.langSignal();
  }
  
  /**
   * 为旧模式提供兼容性访问器
   * 直接返回词条包，允许旧代码继续使用 this.dict.app.title 的形式
   */
  get dict(): typeof zh {
    return this.getLocale();
  }
  
  /**
   * 为旧模式提供兼容性访问器
   * 直接返回词条包，允许旧代码继续使用 this.i18n.app.title 的形式
   */
  get i18n(): typeof zh {
    return this.getLocale();
  }
}`;
        fs.mkdirSync(path.dirname(adapterPath), { recursive: true });
        fs.writeFileSync(adapterPath, adapter, 'utf8');
        (0, logger_1.info)('created adapter service', { file: adapterPath });
    }
    else if (!hasAdapter)
        (0, logger_1.warn)('missing adapter service', { suggest: 'create src/app/i18n/i18n-adapter.ts' });
    // 创建国际化服务
    if (!hasSvc && mode === 'fix') {
        const svc = `import { Injectable, signal } from '@angular/core'
import { en } from './en'
import { zh } from './zh'

@Injectable({ providedIn: 'root' })
export class I18nLocaleService {
  private langSignal = signal<'zh' | 'en'>('zh');
  
  // 响应式语言状态
  lang = this.langSignal.asReadonly();
  
  constructor() {
    // 从localStorage读取缓存
    const cachedLang = localStorage.getItem('i18n-lang');
    if (cachedLang && ['zh', 'en'].includes(cachedLang)) {
      this.langSignal.set(cachedLang as any);
    }
  }
  
  getLocale() { 
    const cached = localStorage.getItem('i18n-lang'); 
    if (cached && ['zh', 'en'].includes(cached)) this.langSignal.set(cached as any); 
    const currentLang = this.langSignal();
    return currentLang === 'en' ? en as any : zh 
  }
  
  get(key: string, params?: Record<string, unknown>) { 
    const pack: any = this.getLocale(); 
    const val = key.split('.').reduce((o,k)=>o?o[k]:undefined, pack); 
    let s = typeof val === 'string' ? val : ''; 
    if (params) { 
      for (const [k,v] of Object.entries(params)) 
        s = s.replace(new RegExp('\\\\{'+k+'\\\\}','g'), String(v)) 
    } 
    return s 
  }
  
  setLang(code: 'en'|'zh') { 
    this.langSignal.set(code); 
    localStorage.setItem('i18n-lang', code); 
    // 不再刷新页面，使用信号实现响应式更新
  }
}`;
        fs.mkdirSync(path.dirname(svcPath), { recursive: true });
        fs.writeFileSync(svcPath, svc, 'utf8');
        (0, logger_1.info)('created service', { file: svcPath });
    }
    else if (!hasSvc)
        (0, logger_1.warn)('missing service', { suggest: 'create src/app/i18n/index.ts' });
    // 创建国际化管道
    if (!hasPipe && mode === 'fix') {
        const pipe = `import { Pipe, PipeTransform } from '@angular/core'
import { I18nLocaleService } from './index'
@Pipe({ name: 'i18n', standalone: true })
export class I18nPipe implements PipeTransform { constructor(private locale: I18nLocaleService){} transform(key: string, params?: Record<string, unknown>) { return this.locale.get(key, params) } }`;
        fs.mkdirSync(path.dirname(pipePath), { recursive: true });
        fs.writeFileSync(pipePath, pipe, 'utf8');
        (0, logger_1.info)('created pipe', { file: pipePath });
    }
    else if (!hasPipe)
        (0, logger_1.warn)('missing pipe', { suggest: 'create src/app/i18n/i18n.pipe.ts' });
    // 检查 app.config.ts 是否配置了服务
    const appConfigPath = path.join(process.cwd(), 'src/app/app.config.ts');
    if (fs.existsSync(appConfigPath)) {
        let configContent = readFile(appConfigPath);
        if (!/I18nLocaleService/.test(configContent)) {
            if (mode === 'fix') {
                // 在providers数组中添加I18nLocaleService
                configContent = configContent.replace(/(providers:\s*\[\s*([^\]]*))/, (_match, fullMatch, existingProviders) => {
                    if (existingProviders.includes('I18nLocaleService')) {
                        return fullMatch; // 已存在，无需添加
                    }
                    // 在providers数组开始后添加服务
                    return `providers: [${existingProviders ? existingProviders + ',' : ''}
    I18nLocaleService]`;
                });
                // 如果没有import I18nLocaleService，则添加import
                if (!/I18nLocaleService/.test(configContent)) {
                    configContent = configContent.replace(/(import\s+\{[^\}]*\}\s+from\s+['"][^'"]*app\/i18n['"];)/, `import { I18nLocaleService } from './i18n';
$&`);
                }
                writeFile(appConfigPath, configContent);
                (0, logger_1.info)('added service to app config', { file: appConfigPath });
            }
            else {
                (0, logger_1.warn)('service not configured in app config', { file: appConfigPath });
            }
        }
    }
    // 检查 app.component.ts 是否导入了I18nPipe
    const appComp = path.join(process.cwd(), 'src/app/app.component.ts');
    if (fs.existsSync(appComp)) {
        let s = readFile(appComp);
        if (!/I18nPipe/.test(s)) {
            if (mode === 'fix') {
                // 找到最后一个import语句后插入import
                const lastImportMatch = s.match(/import .+?;\n(?=import|$|export)/g);
                if (lastImportMatch) {
                    const lastImportIndex = s.lastIndexOf('import ');
                    const eol = s.indexOf('\n', lastImportIndex);
                    if (eol >= 0) {
                        s = s.slice(0, eol + 1) + `import { I18nPipe } from './i18n/i18n.pipe'
` + s.slice(eol + 1);
                    }
                }
                // 在imports数组中添加I18nPipe
                s = s.replace(/imports:\s*\[([^\{\]]*)\]/, (_m, inside) => {
                    const imports = inside.split(',').map((imp) => imp.trim()).filter((imp) => imp);
                    if (!imports.includes('I18nPipe')) {
                        return `imports: [${inside} , I18nPipe]`;
                    }
                    return _m;
                });
                writeFile(appComp, s);
                (0, logger_1.info)('imported pipe globally', { file: appComp });
            }
            else {
                (0, logger_1.warn)('pipe not globally imported', { file: appComp });
            }
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
/**
 * 专门处理词条读取、拍平并写入文件的函数
 * @param dictDir 词条文件目录
 * @param outDir 输出目录
 * @param langs 语言列表
 * @param arrayMode 数组模式
 */
async function processDictFiles(dictDir, outDir, langs, arrayMode) {
    const { loadDictFile } = await Promise.resolve().then(() => __importStar(require('../util/dict-simple')));
    for (const lang of langs) {
        const fp = path.join(process.cwd(), dictDir, `${lang}.ts`);
        if (!fs.existsSync(fp)) {
            (0, logger_1.warn)('lang file missing', { file: fp });
            continue;
        }
        try {
            // 使用新的 loadDictFile 函数读取词条文件
            const dictData = await loadDictFile(fp);
            // 展开对象树到键路径集合
            const flat = {};
            flattenDictObject(dictData, '', flat);
            // 写入JSON文件
            (0, dict_flatten_1.writeJson)(path.isAbsolute(outDir) ? outDir : path.join(process.cwd(), outDir), lang, flat);
            (0, logger_1.info)('dict processed and json written', { lang, file: fp, keys: Object.keys(flat).length });
        }
        catch (error) {
            (0, logger_1.warn)('failed to process dict file', { file: fp, error: String(error) });
        }
    }
}
exports.processDictFiles = processDictFiles;
/**
 * 展开对象树到键路径集合
 * @param obj 对象
 * @param base 基础路径
 * @param out 输出集合
 */
function flattenDictObject(obj, base, out) {
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        for (const k of Object.keys(obj)) {
            const v = obj[k];
            const next = base ? `${base}.${k}` : k;
            if (v && typeof v === 'object' && !Array.isArray(v)) {
                flattenDictObject(v, next, out);
            }
            else {
                out[next] = v;
            }
        }
    }
    else if (Array.isArray(obj)) {
        // 处理数组
        obj.forEach((item, index) => {
            const next = base ? `${base}.${index}` : `${index}`;
            if (typeof item === 'object' && item !== null) {
                flattenDictObject(item, next, out);
            }
            else {
                out[next] = item;
            }
        });
    }
    else {
        out[base] = obj;
    }
}
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
function loadLangDict(dictDir, langPrefix, arrayMode) {
    const dir = path.join(process.cwd(), dictDir);
    if (!fs.existsSync(dir))
        return {};
    const re = new RegExp(`^${langPrefix}[A-Za-z0-9_-]*\\.ts$`);
    const files = fs.readdirSync(dir).filter(n => re.test(n));
    let out = {};
    for (const name of files) {
        const fp = path.join(dir, name);
        const flat = (0, dict_flatten_1.flattenLangFile)(fp, arrayMode);
        out = { ...out, ...flat };
    }
    return out;
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
        const oIndexLit = s.match(/\{\{\s*[A-Za-z_]\w*\.([A-Za-z0-9_.]+)\s*\[\s*['"]([^'"]+)['"]\s*\}\}/);
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
    const usage = `Usage: i18n-refactor [init | --mode=replace|restore|bootstrap|delete|init|dict-process|inject-i18n] [--help] [--version]`;
    const version = '0.2.0';
    for (const a of args) { // 解析参数
        if (a === 'init')
            mode = 'init';
        const r = a.match(/^--mode=(replace|restore|bootstrap|delete|init|dict-process|inject-i18n)$/);
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
    // 专门处理词条读取、拍平并写入文件的模式
    if (mode === 'dict-process') {
        processDictFiles(config_1.config.dictDir || 'src/app/i18n', (config_1.config.jsonOutDir || 'i18n-refactor/out'), (config_1.config.languages || ['zh', 'en']), (config_1.config.jsonArrayMode || 'nested'));
        return;
    }
    // 注入ngx-translate国际化功能
    if (mode === 'inject-i18n') {
        injectNgxTranslate(config_1.config.dictDir || 'src/app/i18n', (config_1.config.ensureAngular || 'fix'));
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
    const complexCases = []; // 复杂情况列表
    const langs = (config_1.config.languages || ['zh', 'en']);
    const dictDir = config_1.config.dictDir || 'src/app/i18n';
    const arrayMode = (config_1.config.jsonArrayMode || 'nested');
    const zhMap = loadLangDict(dictDir, 'zh', arrayMode);
    const enMap = loadLangDict(dictDir, 'en', arrayMode);
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
        for (const r of results.filter(x => x.changed))
            (0, logger_1.info)('result', r);
    }
    // Always generate HTML report
    const outDir = path.isAbsolute((config_1.config.jsonOutDir || 'i18n-refactor/out')) ? config_1.config.jsonOutDir : path.join(process.cwd(), (config_1.config.jsonOutDir || 'i18n-refactor/out'));
    fs.mkdirSync(outDir, { recursive: true });
    const html = renderHtmlReport(summary, results.filter(r => r.changed), details, complexCases);
    const fp = path.join(outDir, 'report.html');
    fs.writeFileSync(fp, html, 'utf8');
    (0, logger_1.info)('html report written', { file: fp });
    // 在replace模式完成后，自动确保i18n服务和管道已正确配置
    if (mode === 'replace' && !dryRun) {
        (0, logger_1.info)('ensuring i18n configuration after replace', {});
        ensureAngularFiles(config_1.config.dictDir || 'src/app/i18n', 'fix');
    }
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
function writeHtmlReportForTest(outDir, summary, results, details, complexCases = []) {
    fs.mkdirSync(outDir, { recursive: true });
    const html = renderHtmlReport(summary, results, details, complexCases);
    const fp = path.join(outDir, 'report.html');
    fs.writeFileSync(fp, html, 'utf8');
    return fp;
}
exports.writeHtmlReportForTest = writeHtmlReportForTest;
