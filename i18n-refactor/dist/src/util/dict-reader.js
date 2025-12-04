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
exports.setDictDir = exports.pickRoot = exports.hasKey = void 0;
const fs = __importStar(require("fs")); // 引入文件系统模块，用于读取字典文件
const path = __importStar(require("path")); // 引入路径模块，用于拼接与解析目录
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
function parseTsObject(fileContent) {
    const s = fileContent // 原始文件内容
        .replace(/export\s+const\s+\w+\s*=\s*/, '') // 去掉导出常量前缀
        .replace(/as\s+const\s*;?\s*$/, ''); // 去掉 as const 尾注
    try { // 解析对象字面量
        // eslint-disable-next-line no-new-func
        return Function(`return (${s})`)(); // 以安全方式仅对对象字面量求值
    }
    catch { // 解析失败兜底
        return null; // 返回空
    }
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
            const content = fs.readFileSync(fp, 'utf8'); // 读取文件
            const obj = parseTsObject(content); // 解析对象
            if (!obj || typeof obj !== 'object')
                continue; // 无法解析则跳过
            for (const root of Object.keys(obj)) { // 遍历顶层根
                const set = map[root] || (map[root] = new Set()); // 获取或创建集合
                flatten(root, obj[root], '', set); // 展开根下所有键路径
            }
        }
    }
    return map; // 返回结果
}
const cache = { map: null }; // 简单缓存，避免重复解析字典
function hasKey(root, pathInRoot) {
    if (!cache.map)
        cache.map = buildDictMap(); // 延迟构建映射
    const set = cache.map[root]; // 取根集合
    return !!set && set.has(pathInRoot); // 返回存在性
}
exports.hasKey = hasKey;
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
