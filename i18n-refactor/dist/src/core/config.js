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
exports.config = exports.loadConfig = exports.loadConfigFromArgs = exports.loadConfigFromEnv = exports.loadConfigFromFile = exports.deepMerge = exports.defaults = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// 默认配置常量，供各模块使用
exports.defaults = {
    serviceTypeName: 'I18nLocaleService', // 服务类型名
    serviceVariableName: 'i18n', // 服务变量名
    getLocalMethod: 'getLocale', // 词条根对象方法（与现有代码保持一致）
    dictDir: 'src/app/i18n',
    languages: ['zh', 'en'],
    jsonOutDir: 'i18n-refactor/out',
    jsonArrayMode: 'nested',
    dir: process.cwd(),
    dryRun: false,
    logLevel: 'info',
    format: 'json',
    port: 3002
};
// 简单深合并（对象与数组覆盖）
function deepMerge(base, extra) {
    const out = { ...base };
    for (const [k, v] of Object.entries(extra || {})) {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            out[k] = deepMerge(out[k] || {}, v);
        }
        else if (v !== undefined) {
            out[k] = v;
        }
    }
    return out;
}
exports.deepMerge = deepMerge;
// 从配置文件加载配置
function loadConfigFromFile(configPath) {
    const defaultConfigPaths = [
        path.join(process.cwd(), 'omrp.config.json'),
        path.join(process.cwd(), 'i18n-refactor.config.json'),
        path.join(process.cwd(), '.i18n-refactor.json')
    ];
    const pathsToTry = configPath ? [configPath] : defaultConfigPaths;
    for (const fp of pathsToTry) {
        try {
            if (fs.existsSync(fp)) {
                const txt = fs.readFileSync(fp, 'utf8');
                return JSON.parse(txt);
            }
        }
        catch (error) {
            console.warn(`Failed to load config from ${fp}:`, error);
        }
    }
    return {};
}
exports.loadConfigFromFile = loadConfigFromFile;
// 从环境变量加载配置
function loadConfigFromEnv() {
    const envConfig = {};
    const prefix = 'I18N_REFACTOR_';
    for (const [key, value] of Object.entries(process.env)) {
        if (key.startsWith(prefix) && value !== undefined) {
            // 转换为驼峰命名
            const envKey = key.slice(prefix.length);
            const configKey = envKey.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
            // 特殊处理不同类型的值
            if (value === 'true') {
                envConfig[configKey] = true;
            }
            else if (value === 'false') {
                envConfig[configKey] = false;
            }
            else if (!isNaN(Number(value))) {
                envConfig[configKey] = Number(value);
            }
            else if (configKey === 'languages') {
                envConfig[configKey] = value.split(',').map(lang => lang.trim());
            }
            else {
                envConfig[configKey] = value;
            }
        }
    }
    return envConfig;
}
exports.loadConfigFromEnv = loadConfigFromEnv;
// 从命令行参数加载配置
function loadConfigFromArgs(args) {
    const argConfig = {};
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--')) {
            const [key, value] = arg.slice(2).split('=');
            if (key === 'dry-run') {
                argConfig.dryRun = true;
            }
            else if (key === 'help' || key === 'version') {
                // These are handled separately in the CLI
                continue;
            }
            else if (value !== undefined) {
                const configKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
                // 特殊处理不同类型的值
                if (value === 'true') {
                    argConfig[configKey] = true;
                }
                else if (value === 'false') {
                    argConfig[configKey] = false;
                }
                else if (!isNaN(Number(value))) {
                    argConfig[configKey] = Number(value);
                }
                else if (configKey === 'languages') {
                    argConfig[configKey] = value.split(',').map(lang => lang.trim());
                }
                else {
                    argConfig[configKey] = value;
                }
            }
        }
    }
    return argConfig;
}
exports.loadConfigFromArgs = loadConfigFromArgs;
// 主配置加载函数
function loadConfig(args = process.argv.slice(2), configPath) {
    const fileConfig = loadConfigFromFile(configPath);
    const envConfig = loadConfigFromEnv();
    const argConfig = loadConfigFromArgs(args);
    // 优先级：命令行参数 > 环境变量 > 配置文件 > 默认值
    return deepMerge(exports.defaults, deepMerge(fileConfig, deepMerge(envConfig, argConfig)));
}
exports.loadConfig = loadConfig;
// 导出默认配置实例
exports.config = loadConfig();
