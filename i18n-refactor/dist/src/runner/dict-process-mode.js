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
exports.processDictFiles = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const logger_1 = require("../util/logger");
const dict_flatten_1 = require("../util/dict-flatten");
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
