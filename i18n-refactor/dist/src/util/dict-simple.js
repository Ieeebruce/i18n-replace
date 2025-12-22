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
exports.loadPreprocessedDict = exports.preprocessDictFiles = exports.getDictKeys = exports.loadDictFile = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const ts = __importStar(require("typescript"));
// 简单的缓存机制
const dictCache = {};
/**
 * 通过动态导入读取词条文件（支持import语句）
 * @param fp 词条文件路径
 * @returns 词条数据对象
 */
async function loadDictFile(fp) {
    // 检查缓存
    if (dictCache[fp]) {
        return dictCache[fp];
    }
    try {
        let moduleExports;
        // 对于 .ts 文件，使用 TypeScript 编译后执行
        if (fp.endsWith('.ts')) {
            const sourceCode = fs.readFileSync(fp, 'utf8');
            // 编译 TypeScript 代码为 JavaScript
            const compiled = ts.transpile(sourceCode, {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2020,
                strict: false,
                esModuleInterop: true
            });
            // 使用 Function 构造函数安全地执行代码
            const moduleFunc = new Function('exports', 'require', 'module', '__filename', '__dirname', compiled);
            const module = { exports: {} };
            const requireFunc = (id) => {
                if (id === 'typescript')
                    return ts;
                return require(id);
            };
            moduleFunc(module.exports, requireFunc, module, fp, path.dirname(fp));
            moduleExports = module.exports;
        }
        else {
            // 对于 .js 文件，使用 require
            delete require.cache[require.resolve(fp)];
            moduleExports = require(fp);
        }
        // 处理默认导出和具名导出
        let result = {};
        // 如果有默认导出且默认导出是对象
        if (moduleExports && typeof moduleExports === 'object' && moduleExports.default && typeof moduleExports.default === 'object') {
            // 合并默认导出和具名导出
            result = { ...moduleExports.default, ...moduleExports };
            // 移除default属性本身
            delete result.default;
        }
        else if (moduleExports && typeof moduleExports === 'object') {
            // 只有具名导出的情况
            result = { ...moduleExports };
        }
        // 缓存结果
        dictCache[fp] = result;
        return result;
    }
    catch (e) {
        console.error('Error loading dictionary file:', e);
        throw new Error(`Failed to import dictionary file: ${fp}`);
    }
}
exports.loadDictFile = loadDictFile;
/**
 * 获取所有词条键的集合（用于键存在性检查）
 * @param dictData 词条数据对象
 * @returns 根到键集合的映射
 */
function getDictKeys(dictData) {
    const roots = {};
    // 遍历所有导出的属性
    for (const [rootName, rootObj] of Object.entries(dictData)) {
        if (rootObj && typeof rootObj === 'object') {
            const set = roots[rootName] || (roots[rootName] = new Set());
            flattenObject(rootObj, '', set);
        }
    }
    return roots;
}
exports.getDictKeys = getDictKeys;
/**
 * 展开对象树到键路径集合
 * @param obj 对象
 * @param base 基础路径
 * @param out 输出集合
 */
function flattenObject(obj, base, out) {
    if (obj && typeof obj === 'object') {
        for (const k of Object.keys(obj)) {
            const v = obj[k];
            const next = base ? `${base}.${k}` : k;
            if (v && typeof v === 'object' && !Array.isArray(v)) {
                flattenObject(v, next, out);
            }
            else {
                out.add(next);
            }
        }
    }
}
/**
 * 预处理词条文件，将TS格式转换为JSON格式
 * @param dictDir 词条文件目录
 * @param outDir 输出目录
 */
async function preprocessDictFiles(dictDir, outDir = 'i18n-cache') {
    console.log('开始预处理词条文件...');
    // 创建输出目录
    fs.mkdirSync(outDir, { recursive: true });
    if (!fs.existsSync(dictDir)) {
        console.warn(`词条目录不存在: ${dictDir}`);
        return;
    }
    // 查找语言文件
    const langFiles = fs.readdirSync(dictDir).filter(file => file.endsWith('.ts') && /^[a-z]{2}(\.[a-z0-9_-]+)?\.ts$/.test(file));
    console.log(`找到语言文件:`, langFiles);
    for (const file of langFiles) {
        try {
            const filePath = path.join(dictDir, file);
            console.log(`处理文件: ${filePath}`);
            // 读取词条文件
            const dictData = await loadDictFile(filePath);
            // 生成输出文件路径
            const outFile = path.join(outDir, file.replace('.ts', '.json'));
            // 保存为JSON文件
            fs.writeFileSync(outFile, JSON.stringify(dictData, null, 2), 'utf8');
            console.log(`已保存: ${outFile}`);
        }
        catch (error) {
            console.error(`处理文件 ${file} 时出错:`, error);
        }
    }
    console.log('词条文件预处理完成!');
}
exports.preprocessDictFiles = preprocessDictFiles;
/**
 * 从预处理的JSON文件中加载词条数据
 * @param lang 语言代码
 * @param cacheDir 缓存目录
 * @returns 词条数据对象
 */
function loadPreprocessedDict(lang, cacheDir = 'i18n-cache') {
    const filePath = path.join(cacheDir, `${lang}.json`);
    if (!fs.existsSync(filePath)) {
        return null;
    }
    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return data;
    }
    catch (error) {
        console.error(`加载预处理文件 ${filePath} 时出错:`, error);
        return null;
    }
}
exports.loadPreprocessedDict = loadPreprocessedDict;
