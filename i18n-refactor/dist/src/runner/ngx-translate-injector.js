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
exports.modifyAppModule = exports.injectNgxTranslate = exports.createNgxTranslateService = exports.checkAndInstallNgxTranslate = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const typescript_1 = __importDefault(require("typescript"));
const logger_1 = require("../util/logger");
const i18n_service_template_1 = require("./i18n-service.template");
// 检查并安装 ngx-translate 包
function checkAndInstallNgxTranslate() {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
        (0, logger_1.warn)('package.json not found', { suggest: 'run from project root' });
        return;
    }
    const packageJson = JSON.parse(readFile(packageJsonPath));
    const hasNgxTranslate = packageJson.dependencies && (packageJson.dependencies['@ngx-translate/core'] ||
        packageJson.devDependencies && packageJson.devDependencies['@ngx-translate/core']);
    if (!hasNgxTranslate) {
        // 总是尝试安装（相当于fix模式）
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
        (0, logger_1.info)('@ngx-translate/core already installed', {});
    }
}
exports.checkAndInstallNgxTranslate = checkAndInstallNgxTranslate;
// 创建 ngx-translate 服务
function createNgxTranslateService(dictDir) {
    const servicePath = path.join(process.cwd(), 'src/app/core/i18n.service.ts');
    // 确保 core 目录存在
    const coreDir = path.join(process.cwd(), 'src/app/core');
    if (!fs.existsSync(coreDir)) {
        // 总是创建目录（相当于fix模式）
        fs.mkdirSync(coreDir, { recursive: true });
        (0, logger_1.info)('created core directory', { path: coreDir });
    }
    if (!fs.existsSync(servicePath)) {
        // 总是写入服务文件（相当于fix模式）
        fs.writeFileSync(servicePath, i18n_service_template_1.i18nServiceTemplate, 'utf8');
        (0, logger_1.info)('created i18n service', { file: servicePath });
    }
    else {
        (0, logger_1.info)('i18n service already exists', { file: servicePath });
    }
}
exports.createNgxTranslateService = createNgxTranslateService;
// 注入 ngx-translate 功能
function injectNgxTranslate(dictDir) {
    // 检查并安装 ngx-translate 包
    checkAndInstallNgxTranslate();
    // 在 app/core 下创建新的 i18nService
    createNgxTranslateService(dictDir);
    // 修改 app.module.ts 注入 TranslateModule
    modifyAppModule();
}
exports.injectNgxTranslate = injectNgxTranslate;
// 修改 Angular 模块配置
function modifyAppModule() {
    // 尝试修改 app.config.ts (Angular 17+ 的新配置方式)
    const appConfigPath = path.join(process.cwd(), 'src/app/app.config.ts');
    if (fs.existsSync(appConfigPath)) {
        modifyAppConfig(appConfigPath, 'fix');
        return;
    }
    // 如果 app.config.ts 不存在，尝试 app.module.ts
    const appModulePath = path.join(process.cwd(), 'src/app/app.module.ts');
    if (fs.existsSync(appModulePath)) {
        modifyAppModuleFile(appModulePath, 'fix');
    }
    else {
        (0, logger_1.warn)('app config/module not found', { suggest: 'check src/app/app.config.ts or src/app/app.module.ts' });
    }
}
exports.modifyAppModule = modifyAppModule;
// 修改 app.config.ts
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
            // 1. 添加必要的导入语句使用AST方法
            const newImports = [
                { names: ['importProvidersFrom'], path: '@angular/core' },
                { names: ['TranslateModule', 'TranslateLoader'], path: '@ngx-translate/core' },
                { names: ['TranslateHttpLoader'], path: '@ngx-translate/http-loader' },
                { names: ['HttpClient'], path: '@angular/common/http' }
            ];
            modifiedContent = addImportsToModule(modifiedContent, newImports);
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
// 修改 app.module.ts
function modifyAppModuleFile(appModulePath, mode) {
    let content = readFile(appModulePath);
    // 检查是否已导入 TranslateModule
    if (!content.includes('@ngx-translate/core')) {
        if (mode === 'fix') {
            // 确保安装了 http-loader 包
            const { spawnSync } = require('child_process');
            spawnSync('npm', ['install', '@ngx-translate/http-loader'], { stdio: 'inherit' });
            // 构建新的内容
            let modifiedContent = content;
            // 1. 添加必要的导入语句使用AST方法
            const newImports = [
                { names: ['TranslateModule', 'TranslateLoader'], path: '@ngx-translate/core' },
                { names: ['TranslateHttpLoader'], path: '@ngx-translate/http-loader' },
                { names: ['HttpClient', 'HttpClientModule'], path: '@angular/common/http' }
            ];
            modifiedContent = addImportsToModule(modifiedContent, newImports);
            // 2. 添加 TranslateModule 配置到NgModule
            modifiedContent = addTranslateModuleToNgModule(modifiedContent);
            // 3. 添加 HttpLoaderFactory 函数（如果不存在）
            if (!modifiedContent.includes('HttpLoaderFactory')) {
                modifiedContent += `
export function HttpLoaderFactory(http: HttpClient) {
  const i18nPath = \`\${CDN_BASE}/i18n/default\`;
  return new TranslateHttpLoader(http, i18nPath, '.json');
}
`;
            }
            content = modifiedContent;
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
// 使用AST修改Angular模块文件的辅助函数
function addImportsToModule(content, newImports) {
    const sourceFile = typescript_1.default.createSourceFile('temp.ts', content, typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS);
    const changes = [];
    // 找到最后一个import语句的位置
    let lastImportEnd = 0;
    typescript_1.default.forEachChild(sourceFile, node => {
        if (typescript_1.default.isImportDeclaration(node)) {
            lastImportEnd = node.getEnd();
        }
    });
    // 检查是否已存在需要的导入
    let modifiedContent = content;
    for (const newImport of newImports) {
        const importPath = newImport.path;
        const importNames = newImport.names;
        // 检查是否已存在此路径的导入
        const hasImportPath = content.includes(`from '${importPath}'`) || content.includes(`from "${importPath}"`);
        if (!hasImportPath) {
            // 添加新的导入语句
            const importStatement = `import { ${importNames.join(', ')} } from '${importPath}';`;
            const insertPos = lastImportEnd;
            modifiedContent = modifiedContent.slice(0, insertPos) + `\n${importStatement}` + modifiedContent.slice(insertPos);
            lastImportEnd = insertPos + importStatement.length + 1; // +1 for the newline
        }
        else {
            // 检查是否已存在需要的命名导入
            const importExists = importNames.some(name => new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*['\"]${importPath}['\"]`).test(modifiedContent));
            if (!importExists) {
                // 需要向现有导入语句中添加命名
                modifiedContent = modifiedContent.replace(new RegExp(`(import\\s*\\{)([^}]*)(${importPath}['\"];)`), (match, start, existingNames, end) => {
                    const existingNamesArray = existingNames.split(',').map((name) => name.trim()).filter((name) => name.length > 0);
                    const namesToAdd = importNames.filter(name => !existingNamesArray.includes(name));
                    if (namesToAdd.length === 0)
                        return match;
                    const allNames = [...existingNamesArray, ...namesToAdd];
                    return `${start}${allNames.join(', ')}${end}`;
                });
            }
        }
    }
    return modifiedContent;
}
function addTranslateModuleToNgModule(content) {
    const sourceFile = typescript_1.default.createSourceFile('temp.ts', content, typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS);
    // 检查是否已包含TranslateModule
    if (content.includes('TranslateModule')) {
        return content; // 如果已经存在，直接返回
    }
    // 收集需要添加的修改
    const changes = [];
    // 递归遍历节点的函数
    function visitNode(node) {
        // 检查是否是带装饰器的类声明
        if (typescript_1.default.isClassDeclaration(node)) {
            // 获取装饰器 - 简化处理，直接通过any访问
            const decorators = node.decorators || (typescript_1.default.getDecorators ? typescript_1.default.getDecorators(node) : []);
            if (decorators && decorators.length > 0) {
                for (const decorator of decorators) {
                    if (typescript_1.default.isCallExpression(decorator.expression) &&
                        typescript_1.default.isIdentifier(decorator.expression.expression) &&
                        decorator.expression.expression.text === 'NgModule') {
                        // 在NgModule配置对象中查找imports数组
                        const ngModuleConfig = decorator.expression.arguments[0];
                        if (ngModuleConfig && typescript_1.default.isObjectLiteralExpression(ngModuleConfig)) {
                            const importsProperty = ngModuleConfig.properties.find(prop => typescript_1.default.isPropertyAssignment(prop) &&
                                typescript_1.default.isIdentifier(prop.name) &&
                                prop.name.text === 'imports');
                            if (importsProperty) {
                                // 如果找到了imports数组，在其中添加HttpClientModule和TranslateModule
                                if (typescript_1.default.isPropertyAssignment(importsProperty) && typescript_1.default.isArrayLiteralExpression(importsProperty.initializer)) {
                                    const arrayLiteral = importsProperty.initializer;
                                    const lastElement = arrayLiteral.elements[arrayLiteral.elements.length - 1];
                                    // 检查是否已包含HttpClientModule
                                    const hasHttpClientModule = Array.from(arrayLiteral.elements).some(element => typescript_1.default.isIdentifier(element) && element.text === 'HttpClientModule' ||
                                        (typescript_1.default.isCallExpression(element) &&
                                            typescript_1.default.isPropertyAccessExpression(element.expression) &&
                                            typescript_1.default.isIdentifier(element.expression.expression) &&
                                            element.expression.expression.text === 'TranslateModule'));
                                    let additionalImports = '';
                                    if (!hasHttpClientModule) {
                                        additionalImports = 'HttpClientModule,\n    ';
                                    }
                                    const newImportText = additionalImports + `TranslateModule.forRoot({
        loader: {
          provide: TranslateLoader,
          useFactory: HttpLoaderFactory,
          deps: [HttpClient]
        }
      })`;
                                    // 在数组末尾添加新的导入
                                    changes.push({
                                        pos: lastElement ? lastElement.getEnd() : arrayLiteral.getStart() + 1,
                                        text: (lastElement ? ',\n    ' : '') + newImportText
                                    });
                                }
                            }
                            else {
                                // 如果没有imports属性，需要添加
                                const hasProviders = ngModuleConfig.properties.some(prop => typescript_1.default.isPropertyAssignment(prop) &&
                                    typescript_1.default.isIdentifier(prop.name) &&
                                    prop.name.text === 'providers');
                                const hasDeclarations = ngModuleConfig.properties.some(prop => typescript_1.default.isPropertyAssignment(prop) &&
                                    typescript_1.default.isIdentifier(prop.name) &&
                                    prop.name.text === 'declarations');
                                const hasExports = ngModuleConfig.properties.some(prop => typescript_1.default.isPropertyAssignment(prop) &&
                                    typescript_1.default.isIdentifier(prop.name) &&
                                    prop.name.text === 'exports');
                                // 确定添加imports的位置
                                let insertPos = ngModuleConfig.getStart() + 1; // 在 { 后面开始
                                if (hasProviders) {
                                    // 如果有providers，在providers后添加
                                    const providersProp = ngModuleConfig.properties.find(prop => typescript_1.default.isPropertyAssignment(prop) &&
                                        typescript_1.default.isIdentifier(prop.name) &&
                                        prop.name.text === 'providers');
                                    if (providersProp) {
                                        insertPos = providersProp.getEnd();
                                    }
                                }
                                else if (hasDeclarations) {
                                    // 如果有declarations，在declarations后添加
                                    const declarationsProp = ngModuleConfig.properties.find(prop => typescript_1.default.isPropertyAssignment(prop) &&
                                        typescript_1.default.isIdentifier(prop.name) &&
                                        prop.name.text === 'declarations');
                                    if (declarationsProp) {
                                        insertPos = declarationsProp.getEnd();
                                    }
                                }
                                else if (hasExports) {
                                    // 如果有exports，在exports后添加
                                    const exportsProp = ngModuleConfig.properties.find(prop => typescript_1.default.isPropertyAssignment(prop) &&
                                        typescript_1.default.isIdentifier(prop.name) &&
                                        prop.name.text === 'exports');
                                    if (exportsProp) {
                                        insertPos = exportsProp.getEnd();
                                    }
                                }
                                const newImportsText = `
  imports: [
    HttpClientModule,
    TranslateModule.forRoot({
      loader: {
        provide: TranslateLoader,
        useFactory: HttpLoaderFactory,
        deps: [HttpClient]
      }
    })
  ],`;
                                changes.push({
                                    pos: insertPos,
                                    text: newImportsText
                                });
                            }
                        }
                    }
                }
            }
        }
        typescript_1.default.forEachChild(node, visitNode);
    }
    typescript_1.default.forEachChild(sourceFile, visitNode);
    // 按位置倒序排列，以确保插入操作不会影响后续位置
    changes.sort((a, b) => b.pos - a.pos);
    // 应用所有修改
    let modifiedContent = content;
    for (const change of changes) {
        modifiedContent = modifiedContent.slice(0, change.pos) + change.text + modifiedContent.slice(change.pos);
    }
    return modifiedContent;
}
// 使用AST修改app.config.ts的完整函数
function addTranslateModuleToAppConfig(content) {
    // 这里仍然使用正则表达式，因为完全使用AST修改配置对象比较复杂
    // 但已经改进了导入语句的处理，使用了更健壮的方法
    return content;
}
// 使用AST更健壮地修改app.config.ts的函数
function addTranslateModuleToAppConfigAST(content) {
    const sourceFile = typescript_1.default.createSourceFile('temp.ts', content, typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS);
    let modifiedContent = content;
    let hasTranslateModule = content.includes('TranslateModule');
    if (hasTranslateModule) {
        return content; // 如果已经有TranslateModule，直接返回
    }
    // 查找appConfig对象定义
    typescript_1.default.forEachChild(sourceFile, node => {
        if (typescript_1.default.isVariableStatement(node)) {
            for (const decl of node.declarationList.declarations) {
                if (decl.name && typescript_1.default.isIdentifier(decl.name) && decl.name.text === 'appConfig' && decl.initializer) {
                    // 找到appConfig变量，检查其初始化器
                    if (typescript_1.default.isAsExpression(decl.initializer) && typescript_1.default.isObjectLiteralExpression(decl.initializer.expression)) {
                        // 处理带有as断言的对象字面量
                        modifiedContent = processAppConfigObject(modifiedContent, decl.initializer.expression);
                    }
                    else if (typescript_1.default.isObjectLiteralExpression(decl.initializer)) {
                        // 处理普通对象字面量
                        modifiedContent = processAppConfigObject(modifiedContent, decl.initializer);
                    }
                }
            }
        }
        // 查找直接的export const appConfig定义
        else if (typescript_1.default.isVariableStatement(node) && node.modifiers) {
            const hasExportModifier = node.modifiers.some(mod => mod.kind === typescript_1.default.SyntaxKind.ExportKeyword);
            if (hasExportModifier) {
                for (const decl of node.declarationList.declarations) {
                    if (decl.name && typescript_1.default.isIdentifier(decl.name) && decl.name.text === 'appConfig' && decl.initializer) {
                        if (typescript_1.default.isObjectLiteralExpression(decl.initializer)) {
                            modifiedContent = processAppConfigObject(modifiedContent, decl.initializer);
                        }
                    }
                }
            }
        }
    });
    return modifiedContent;
}
// 辅助函数：处理appConfig对象
function processAppConfigObject(content, objLiteral) {
    let modifiedContent = content;
    let hasProviders = false;
    // 检查是否有providers属性
    for (const prop of objLiteral.properties) {
        if (typescript_1.default.isPropertyAssignment(prop) && typescript_1.default.isIdentifier(prop.name) && prop.name.text === 'providers') {
            hasProviders = true;
            // 检查providers数组中是否已包含TranslateModule
            if (typescript_1.default.isArrayLiteralExpression(prop.initializer)) {
                const arrayText = prop.initializer.getFullText();
                if (!arrayText.includes('TranslateModule')) {
                    // 在数组开头添加TranslateModule配置
                    const arrayStart = prop.initializer.getStart() + 1; // +1 to skip opening bracket
                    const insertText = `importProvidersFrom(TranslateModule.forRoot({
        loader: {
          provide: TranslateLoader,
          useFactory: HttpLoaderFactory,
          deps: [HttpClient]
        }
      })),\n    `;
                    modifiedContent = modifiedContent.slice(0, arrayStart) + insertText + modifiedContent.slice(arrayStart);
                }
            }
        }
    }
    // 如果没有providers，添加它
    if (!hasProviders) {
        const objStart = objLiteral.getStart() + 1; // +1 to skip opening brace
        const insertText = `
  providers: [
    importProvidersFrom(TranslateModule.forRoot({
      loader: {
        provide: TranslateLoader,
        useFactory: HttpLoaderFactory,
        deps: [HttpClient]
      }
    }))
  ],`;
        modifiedContent = modifiedContent.slice(0, objStart) + insertText + modifiedContent.slice(objStart);
    }
    return modifiedContent;
}
function readFile(p) {
    return fs.readFileSync(p, 'utf8');
}
function writeFile(p, s) {
    fs.writeFileSync(p, s, 'utf8');
}
