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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function tryPaths() {
    const cwd = process.cwd();
    const here = __dirname;
    if (dictDirOverride && fs.existsSync(dictDirOverride))
        return [dictDirOverride];
    const candidates = [
        path.join(cwd, 'src/app/i18n'),
        path.join(cwd, 'srcbak/app/i18n'),
        path.resolve(here, '../../../src/app/i18n'),
        path.resolve(here, '../../../srcbak/app/i18n')
    ];
    return Array.from(new Set(candidates)).filter(p => fs.existsSync(p));
}
function parseTsObject(fileContent) {
    const s = fileContent
        .replace(/export\s+const\s+\w+\s*=\s*/, '')
        .replace(/as\s+const\s*;?\s*$/, '');
    try {
        // eslint-disable-next-line no-new-func
        return Function(`return (${s})`)();
    }
    catch {
        return null;
    }
}
function flatten(root, obj, base, out) {
    if (obj && typeof obj === 'object') {
        for (const k of Object.keys(obj)) {
            const v = obj[k];
            const next = base ? `${base}.${k}` : k;
            if (v && typeof v === 'object' && !Array.isArray(v)) {
                flatten(root, v, next, out);
            }
            else {
                out.add(next);
            }
        }
    }
}
function buildDictMap() {
    const map = {};
    const dirs = tryPaths();
    for (const dir of dirs) {
        for (const fname of ['zh.ts', 'en.ts']) {
            const fp = path.join(dir, fname);
            if (!fs.existsSync(fp))
                continue;
            const content = fs.readFileSync(fp, 'utf8');
            const obj = parseTsObject(content);
            if (!obj || typeof obj !== 'object')
                continue;
            for (const root of Object.keys(obj)) {
                const set = map[root] || (map[root] = new Set());
                flatten(root, obj[root], '', set);
            }
        }
    }
    return map;
}
const cache = { map: null };
function hasKey(root, pathInRoot) {
    if (!cache.map)
        cache.map = buildDictMap();
    const set = cache.map[root];
    return !!set && set.has(pathInRoot);
}
exports.hasKey = hasKey;
function pickRoot(roots, pathInRoot) {
    if (!roots || !roots.length)
        return '';
    for (let i = roots.length - 1; i >= 0; i--) {
        const r = roots[i];
        if (hasKey(r, pathInRoot))
            return r;
    }
    return roots[roots.length - 1];
}
exports.pickRoot = pickRoot;
let dictDirOverride = null;
function setDictDir(dir) {
    if (!dir || !dir.trim()) {
        dictDirOverride = null;
        return;
    }
    dictDirOverride = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
}
exports.setDictDir = setDictDir;
