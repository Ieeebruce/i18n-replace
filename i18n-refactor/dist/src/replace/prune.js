"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pruneUnused = void 0;
const typescript_1 = __importDefault(require("typescript"));
function pruneUnused(_sf, code, varNames) {
    // console.log('Pruning vars:', varNames)
    const file = typescript_1.default.createSourceFile('x.ts', code, typescript_1.default.ScriptTarget.Latest, true, typescript_1.default.ScriptKind.TS);
    const del = [];
    const set = new Set(varNames);
    const assignedLocaleNames = new Set();
    const hasGetLocaleCall = (node) => {
        let hit = false;
        const walk = (n) => {
            if (hit)
                return;
            if (typescript_1.default.isCallExpression(n)) {
                const ex = n.expression;
                if (typescript_1.default.isPropertyAccessExpression(ex)) {
                    const nm = ex.name.getText(file);
                    if (nm === 'getLocale' || nm === 'getLocal') {
                        hit = true;
                        return;
                    }
                }
            }
            typescript_1.default.forEachChild(n, walk);
        };
        walk(node);
        return hit;
    };
    const visit = (node) => {
        if (typescript_1.default.isPropertyDeclaration(node)) {
            const id = typescript_1.default.isIdentifier(node.name) ? node.name.text : '';
            if (!id) {
                // no-op
            }
            else if (id === 'i18n') {
                del.push({ s: node.getStart(file), e: node.getEnd() });
            }
            else if (assignedLocaleNames.has(id) || (node.initializer && hasGetLocaleCall(node.initializer))) {
                del.push({ s: node.getStart(file), e: node.getEnd() });
            }
        }
        if (typescript_1.default.isExpressionStatement(node)) {
            const be = node.expression;
            if (typescript_1.default.isBinaryExpression(be) && be.operatorToken.kind === typescript_1.default.SyntaxKind.EqualsToken) {
                const rhsText = be.right.getText(file);
                if (/this\.(?:i18n)\.get\s*\(/.test(rhsText)) {
                    // keep
                }
                else if (hasGetLocaleCall(be.right)) {
                    const left = be.left;
                    if (typescript_1.default.isPropertyAccessExpression(left) && left.expression.kind === typescript_1.default.SyntaxKind.ThisKeyword) {
                        const id = left.name.getText(file);
                        assignedLocaleNames.add(id);
                    }
                    del.push({ s: node.getStart(file), e: node.getEnd() });
                }
            }
        }
        typescript_1.default.forEachChild(node, visit);
    };
    visit(file);
    if (!del.length)
        return code;
    del.sort((a, b) => a.s - b.s);
    let out = '';
    let last = 0;
    for (const r of del) {
        out += code.slice(last, r.s);
        last = r.e;
    }
    out += code.slice(last);
    return out;
}
exports.pruneUnused = pruneUnused;
