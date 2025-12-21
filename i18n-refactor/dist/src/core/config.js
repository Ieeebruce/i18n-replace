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
exports.config = exports.loadConfig = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const defaults = {
    serviceTypeName: 'I18nLocaleService', // 服务类型名
    serviceVariableName: 'i18n', // 服务变量名
    getLocalMethod: 'getLocale', // 词条根对象方法（与现有代码保持一致）
    dictDir: 'src/app/i18n',
    languages: ['zh', 'en'],
    jsonOutDir: 'i18n-refactor/out',
    jsonArrayMode: 'nested',
    ensureAngular: 'fix',
    dir: process.cwd(),
    dryRun: false,
    logLevel: 'info',
    format: 'json'
};
function deepMerge(base, extra) {
    const out = { ...base };
    for (const [k, v] of Object.entries(extra || {})) {
        if (v && typeof v === 'object' && !Array.isArray(v))
            out[k] = deepMerge(out[k] || {}, v);
        else if (v !== undefined)
            out[k] = v;
    }
    return out;
}
function loadConfig() {
    try {
        const fp = path.join(process.cwd(), 'omrp.config.json');
        if (fs.existsSync(fp)) {
            const txt = fs.readFileSync(fp, 'utf8');
            const obj = JSON.parse(txt);
            return deepMerge(defaults, obj);
        }
    }
    catch { }
    return { ...defaults };
}
exports.loadConfig = loadConfig;
exports.config = loadConfig();
