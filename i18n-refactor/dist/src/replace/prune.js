"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pruneUnused = void 0;
const typescript_1 = __importDefault(require("typescript"));
function pruneUnused(_sf, code, varNames) {
    // Pass 1: Collect aliases (properties/variables assigned from getLocale)
    const sf = typescript_1.default.createSourceFile('x.ts', code, typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS);
    const aliases = new Set(varNames);
    const isGetLocaleCall = (n) => {
        let cur = n;
        while (typescript_1.default.isPropertyAccessExpression(cur) || typescript_1.default.isElementAccessExpression(cur)) {
            cur = cur.expression;
        }
        if (typescript_1.default.isCallExpression(cur) && typescript_1.default.isPropertyAccessExpression(cur.expression)) {
            const name = cur.expression.name.text;
            return name === 'getLocale' || name === 'getLocal';
        }
        return false;
    };
    const visitAnalyze = (node) => {
        // Check property initializers: class X { prop = this.i18n.getLocale() }
        if (typescript_1.default.isPropertyDeclaration(node) && node.initializer && isGetLocaleCall(node.initializer)) {
            if (typescript_1.default.isIdentifier(node.name))
                aliases.add(node.name.text);
        }
        // Check assignments: this.prop = this.i18n.getLocale()
        if (typescript_1.default.isBinaryExpression(node) && node.operatorToken.kind === typescript_1.default.SyntaxKind.EqualsToken) {
            if (isGetLocaleCall(node.right)) {
                if (typescript_1.default.isPropertyAccessExpression(node.left) && node.left.expression.kind === typescript_1.default.SyntaxKind.ThisKeyword) {
                    aliases.add(node.left.name.text);
                }
                else if (typescript_1.default.isIdentifier(node.left)) {
                    aliases.add(node.left.text);
                }
            }
        }
        // Check variable declarations: const x = this.i18n.getLocale()
        if (typescript_1.default.isVariableDeclaration(node) && node.initializer && isGetLocaleCall(node.initializer)) {
            if (typescript_1.default.isIdentifier(node.name))
                aliases.add(node.name.text);
        }
        typescript_1.default.forEachChild(node, visitAnalyze);
    };
    visitAnalyze(sf);
    // Pass 2: Collect deletion ranges
    const del = [];
    const deletedItems = [];
    const visitDelete = (node) => {
        // Delete Property Declaration if in aliases
        if (typescript_1.default.isPropertyDeclaration(node) && typescript_1.default.isIdentifier(node.name)) {
            if (aliases.has(node.name.text)) {
                del.push({ s: node.getStart(sf), e: node.getEnd() });
                deletedItems.push(node.getText(sf).trim());
            }
        }
        // Delete Assignment Statement if LHS is alias and RHS is getLocale
        if (typescript_1.default.isExpressionStatement(node)) {
            const expr = node.expression;
            if (typescript_1.default.isBinaryExpression(expr) && expr.operatorToken.kind === typescript_1.default.SyntaxKind.EqualsToken) {
                if (isGetLocaleCall(expr.right)) {
                    let name = '';
                    if (typescript_1.default.isPropertyAccessExpression(expr.left) && expr.left.expression.kind === typescript_1.default.SyntaxKind.ThisKeyword) {
                        name = expr.left.name.text;
                    }
                    else if (typescript_1.default.isIdentifier(expr.left)) {
                        name = expr.left.text;
                    }
                    if (name && aliases.has(name)) {
                        del.push({ s: node.getStart(sf), e: node.getEnd() });
                        deletedItems.push(node.getText(sf).trim());
                    }
                }
            }
        }
        // Delete Variable Statement if declaration is alias and init is getLocale
        if (typescript_1.default.isVariableStatement(node)) {
            let allRemovable = true;
            const names = [];
            for (const decl of node.declarationList.declarations) {
                if (!typescript_1.default.isIdentifier(decl.name)) {
                    allRemovable = false;
                    break;
                }
                if (!aliases.has(decl.name.text)) {
                    allRemovable = false;
                    break;
                }
                if (!decl.initializer || !isGetLocaleCall(decl.initializer)) {
                    allRemovable = false;
                    break;
                }
                names.push(decl.name.text);
            }
            if (allRemovable && node.declarationList.declarations.length > 0) {
                del.push({ s: node.getStart(sf), e: node.getEnd() });
                deletedItems.push(node.getText(sf).trim());
            }
        }
        typescript_1.default.forEachChild(node, visitDelete);
    };
    visitDelete(sf);
    if (!del.length)
        return { code, deleted: [] };
    // Sort and merge ranges
    del.sort((a, b) => a.s - b.s);
    let out = '';
    let last = 0;
    for (const r of del) {
        if (r.s < last)
            continue;
        out += code.slice(last, r.s);
        last = r.e;
    }
    out += code.slice(last);
    return { code: out.replace(/^\s*[\r\n]/gm, ''), deleted: deletedItems };
}
exports.pruneUnused = pruneUnused;
