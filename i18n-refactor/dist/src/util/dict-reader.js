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
exports.setDictDir = exports.pickRoot = exports.getAllRoots = exports.hasKey = exports.setMockDict = void 0;
const fs = __importStar(require("fs")); // 引入文件系统模块，用于读取字典文件
const path = __importStar(require("path")); // 引入路径模块，用于拼接与解析目录
const typescript_1 = __importDefault(require("typescript"));
const logger_1 = require("./logger");
const errors_1 = require("./errors");
function tryPaths() {
    const cwd = process.cwd(); // 当前工作目录
    const here = __dirname; // 当前文件所在目录
    if (dictDirOverride && fs.existsSync(dictDirOverride))
        return [dictDirOverride]; // 如有覆盖且存在则直接使用
    const candidates = [
        path.join(cwd, 'src/app/i18n'), // 项目内默认目录
        path.join(cwd, 'srcbak/app/i18n'), // 备份目录
        path.resolve(here, '../../../src/app/i18n'), // 相对工具文件的上级默认目录
        path.resolve(here, '../../../srcbak/app/i18n') // 相对工具文件的上级备份目录
    ];
    return Array.from(new Set(candidates)).filter(p => fs.existsSync(p)); // 去重后过滤存在的目录
}
function flattenAstObject(obj, base, out) {
    for (const prop of obj.properties) {
        if (!typescript_1.default.isPropertyAssignment(prop))
            continue;
        const name = typescript_1.default.isIdentifier(prop.name) ? prop.name.text : typescript_1.default.isStringLiteral(prop.name) ? prop.name.text : '';
        if (!name)
            continue;
        const next = base ? `${base}.${name}` : name;
        if (prop.initializer && typescript_1.default.isObjectLiteralExpression(prop.initializer)) {
            flattenAstObject(prop.initializer, next, out);
        }
        else {
            out.add(next);
        }
    }
}
function parseDictFile(fp) {
    const text = fs.readFileSync(fp, 'utf8');
    const sf = typescript_1.default.createSourceFile(fp, text, typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS);
    const roots = {};
    const visit = (node) => {
        if (typescript_1.default.isVariableStatement(node)) {
            for (const decl of node.declarationList.declarations) {
                if (decl.initializer) {
                    let top = null;
                    if (typescript_1.default.isObjectLiteralExpression(decl.initializer))
                        top = decl.initializer;
                    else if (typescript_1.default.isAsExpression(decl.initializer) && typescript_1.default.isObjectLiteralExpression(decl.initializer.expression))
                        top = decl.initializer.expression;
                    if (!top)
                        continue;
                    for (const prop of top.properties) {
                        if (!typescript_1.default.isPropertyAssignment(prop))
                            continue;
                        const rootName = typescript_1.default.isIdentifier(prop.name) ? prop.name.text : typescript_1.default.isStringLiteral(prop.name) ? prop.name.text : '';
                        if (!rootName)
                            continue;
                        const set = roots[rootName] || (roots[rootName] = new Set());
                        if (prop.initializer && typescript_1.default.isObjectLiteralExpression(prop.initializer))
                            flattenAstObject(prop.initializer, '', set);
                    }
                }
            }
        }
        typescript_1.default.forEachChild(node, visit);
    };
    visit(sf);
    return roots;
}
function flatten(root, obj, base, out) {
    if (obj && typeof obj === 'object') { // 仅处理对象
        for (const k of Object.keys(obj)) { // 遍历子键
            const v = obj[k]; // 子值
            const next = base ? `${base}.${k}` : k; // 计算下一层路径
            if (v && typeof v === 'object' && !Array.isArray(v)) { // 子值仍为对象，递归展开
                flatten(root, v, next, out); // 递归
            }
            else { // 叶子节点（字符串/数组等）
                out.add(next); // 记录叶子路径
            }
        }
    }
}
function buildDictMap() {
    const map = {}; // 初始化映射
    const dirs = tryPaths(); // 获取候选目录
    for (const dir of dirs) { // 遍历目录
        for (const fname of ['zh.ts', 'en.ts']) { // 遍历语言文件
            const fp = path.join(dir, fname); // 组装文件路径
            if (!fs.existsSync(fp))
                continue; // 不存在则跳过
            try {
                const roots = parseDictFile(fp);
                for (const root of Object.keys(roots)) {
                    const set = map[root] || (map[root] = new Set());
                    for (const k of roots[root])
                        set.add(k);
                }
                (0, logger_1.debug)('dict parsed', { file: fp, roots: Object.keys(roots).length });
            }
            catch (e) {
                const err = new errors_1.ParseError('dict parse failed', fp);
                (0, logger_1.warn)(err.message, { file: fp });
            }
        }
    }
    return map; // 返回结果
}
const cache = { map: null, mock: null }; // 简单缓存，避免重复解析字典
function setMockDict(map) {
    cache.mock = map;
}
exports.setMockDict = setMockDict;
function hasKey(root, pathInRoot) {
    if (cache.mock) {
        const set = cache.mock[root];
        return !!set && set.has(pathInRoot);
    }
    if (!cache.map)
        cache.map = buildDictMap(); // 延迟构建映射
    const set = cache.map[root]; // 取根集合
    return !!set && set.has(pathInRoot); // 返回存在性
}
exports.hasKey = hasKey;
function getAllRoots() {
    if (cache.mock)
        return Object.keys(cache.mock);
    if (!cache.map)
        cache.map = buildDictMap();
    return Object.keys(cache.map);
}
exports.getAllRoots = getAllRoots;
function pickRoot(roots, pathInRoot) {
    if (!roots || !roots.length)
        return ''; // 无候选则返回空
    for (let i = roots.length - 1; i >= 0; i--) { // 从右向左（覆盖顺序）检查
        const r = roots[i]; // 当前根
        if (hasKey(r, pathInRoot))
            return r; // 命中则返回该根
    }
    return ''; // 未命中则返回空，表示不加前缀
}
exports.pickRoot = pickRoot;
let dictDirOverride = null; // 字典目录覆盖路径（可选）
function setDictDir(dir) {
    if (!dir || !dir.trim()) {
        dictDirOverride = null;
        return;
    } // 空值则清除覆盖
    dictDirOverride = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir); // 绝对/相对路径处理
}
exports.setDictDir = setDictDir;
