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
exports.writeJson = exports.flattenLangFile = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const typescript_1 = __importDefault(require("typescript"));
function read(p) { return fs.readFileSync(p, 'utf8'); }
function flattenObjectLit(obj, base, out, arrayMode) {
    for (const prop of obj.properties) {
        if (!typescript_1.default.isPropertyAssignment(prop))
            continue;
        const name = typescript_1.default.isIdentifier(prop.name) ? prop.name.text : typescript_1.default.isStringLiteral(prop.name) ? prop.name.text : '';
        if (!name)
            continue;
        const next = base ? `${base}.${name}` : name;
        const init = prop.initializer;
        if (init && typescript_1.default.isObjectLiteralExpression(init)) {
            flattenObjectLit(init, next, out, arrayMode);
        }
        else if (init && typescript_1.default.isArrayLiteralExpression(init)) {
            if (arrayMode === 'nested') {
                out[next] = init.elements.map(el => typescript_1.default.isStringLiteral(el) ? el.text : el.getText());
            }
            else {
                init.elements.forEach((el, idx) => { const v = typescript_1.default.isStringLiteral(el) ? el.text : el.getText(); out[`${next}.${idx}`] = v; });
            }
        }
        else if (init && typescript_1.default.isStringLiteral(init)) {
            out[next] = init.text;
        }
        else {
            out[next] = (init === null || init === void 0 ? void 0 : init.getText()) || '';
        }
    }
}
function flattenLangFile(fp, arrayMode) {
    const text = read(fp);
    const sf = typescript_1.default.createSourceFile(fp, text, typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS);
    const out = {};
    const visit = (node) => {
        if (typescript_1.default.isVariableStatement(node)) {
            for (const decl of node.declarationList.declarations) {
                if (!decl.initializer)
                    continue;
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
                    const root = typescript_1.default.isIdentifier(prop.name) ? prop.name.text : typescript_1.default.isStringLiteral(prop.name) ? prop.name.text : '';
                    if (!root)
                        continue;
                    if (prop.initializer && typescript_1.default.isObjectLiteralExpression(prop.initializer))
                        flattenObjectLit(prop.initializer, root, out, arrayMode);
                }
            }
        }
        typescript_1.default.forEachChild(node, visit);
    };
    visit(sf);
    return out;
}
exports.flattenLangFile = flattenLangFile;
function writeJson(outDir, lang, data) {
    fs.mkdirSync(outDir, { recursive: true });
    const fp = path.join(outDir, `${lang}.json`);
    fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
}
exports.writeJson = writeJson;
