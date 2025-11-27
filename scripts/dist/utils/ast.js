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
exports.resolveKey = exports.flatten = exports.resolveKeyFromContext = exports.collectTemplateKeys = exports.collectVarRootOrder = exports.findLocaleVarNames = exports.findServiceParamName = exports.createSourceFile = exports.i18nAstConfig = void 0;
const ts = __importStar(require("typescript"));
exports.i18nAstConfig = {
    serviceTypeName: 'I18nLocaleService',
    getLocaleMethod: 'getLocale',
    getMethod: 'get',
    fallbackServiceParamName: 'locale'
};
function createSourceFile(fileName, code) {
    return ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}
exports.createSourceFile = createSourceFile;
function findServiceParamName(sf) {
    let out = null;
    function visit(node) {
        if (ts.isConstructorDeclaration(node)) {
            for (const p of node.parameters) {
                if (p.type && ts.isTypeReferenceNode(p.type) && p.type.typeName && p.type.typeName.getText(sf) === exports.i18nAstConfig.serviceTypeName) {
                    const nm = p.name.getText(sf);
                    out = nm;
                }
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(sf);
    return out || exports.i18nAstConfig.fallbackServiceParamName;
}
exports.findServiceParamName = findServiceParamName;
function isGetLocaleCall(sf, expr, serviceName) {
    if (!expr || !ts.isCallExpression(expr))
        return false;
    const ex = expr.expression;
    return ts.isPropertyAccessExpression(ex) && ex.name.getText(sf) === exports.i18nAstConfig.getLocaleMethod && ts.isPropertyAccessExpression(ex.expression) && ex.expression.expression && ex.expression.expression.kind === ts.SyntaxKind.ThisKeyword && ex.expression.name.getText(sf) === serviceName;
}
function isServiceGetCall(sf, expr, serviceName) {
    if (!expr || !ts.isCallExpression(expr))
        return false;
    const ex = expr.expression;
    return ts.isPropertyAccessExpression(ex) && ex.name.getText(sf) === exports.i18nAstConfig.getMethod && ts.isPropertyAccessExpression(ex.expression) && ex.expression.expression && ex.expression.expression.kind === ts.SyntaxKind.ThisKeyword && ex.expression.name.getText(sf) === serviceName;
}
function isVarRootAccess(sf, expr, localeVars) {
    if (!expr || !ts.isPropertyAccessExpression(expr))
        return false;
    const base = expr.expression;
    return ts.isPropertyAccessExpression(base) && base.expression && base.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isIdentifier(base.name) && localeVars.has(base.name.getText(sf));
}
function findLocaleVarNames(sf, serviceName) {
    const out = new Set();
    const localeVars = new Set();
    function visit(node) {
        if (ts.isPropertyDeclaration(node) && node.initializer && isGetLocaleCall(sf, node.initializer, serviceName)) {
            if (node.name && ts.isIdentifier(node.name)) {
                out.add(node.name.getText(sf));
                localeVars.add(node.name.getText(sf));
            }
        }
        if (ts.isPropertyDeclaration(node) && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
            const spreads = node.initializer.properties.filter(p => ts.isSpreadAssignment(p));
            const hasServiceGet = spreads.some(sp => isServiceGetCall(sf, sp.expression, serviceName));
            const hasVarRootAccess = spreads.some(sp => isVarRootAccess(sf, sp.expression, localeVars));
            if (hasServiceGet || hasVarRootAccess) {
                if (node.name && ts.isIdentifier(node.name))
                    out.add(node.name.getText(sf));
            }
        }
        if (ts.isMethodDeclaration(node) && node.body && node.name && ts.isIdentifier(node.name)) {
            const ret = node.body.statements.find(s => ts.isReturnStatement(s));
            if (ret && ret.expression && isGetLocaleCall(sf, ret.expression, serviceName))
                out.add(node.name.getText(sf));
        }
        if (ts.isConstructorDeclaration(node)) {
            for (const s of node.body ? node.body.statements : []) {
                if (ts.isExpressionStatement(s) && ts.isBinaryExpression(s.expression)) {
                    const be = s.expression;
                    if (be.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(be.left) && be.left.expression && be.left.expression.kind === ts.SyntaxKind.ThisKeyword && isGetLocaleCall(sf, be.right, serviceName)) {
                        if (ts.isIdentifier(be.left.name)) {
                            out.add(be.left.name.getText(sf));
                            localeVars.add(be.left.name.getText(sf));
                        }
                    }
                    if (be.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(be.left) && be.left.expression && be.left.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isObjectLiteralExpression(be.right)) {
                        const spreads2 = be.right.properties.filter(p => ts.isSpreadAssignment(p));
                        const hasServiceGet2 = spreads2.some(sp => isServiceGetCall(sf, sp.expression, serviceName));
                        const hasVarRootAccess2 = spreads2.some(sp => isVarRootAccess(sf, sp.expression, localeVars));
                        if (hasServiceGet2 || hasVarRootAccess2) {
                            if (ts.isIdentifier(be.left.name))
                                out.add(be.left.name.getText(sf));
                        }
                    }
                }
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(sf);
    if (out.size === 0)
        out.add('T');
    return Array.from(out).filter(n => n !== serviceName);
}
exports.findLocaleVarNames = findLocaleVarNames;
function collectVarRootOrder(sf, serviceName, varNames) {
    const map = new Map();
    function visit(node) {
        if (ts.isPropertyDeclaration(node) && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
            const spreads = node.initializer.properties.filter(p => ts.isSpreadAssignment(p));
            const roots = [];
            for (const sp of spreads) {
                const expr = sp.expression;
                if (isServiceGetCall(sf, expr, serviceName)) {
                    const arg = expr.arguments[0];
                    if (arg && ts.isStringLiteral(arg))
                        roots.push(arg.text);
                }
                else if (ts.isPropertyAccessExpression(expr)) {
                    const base = expr.expression;
                    if (ts.isPropertyAccessExpression(base) && base.expression && base.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isIdentifier(base.name) && varNames.includes(base.name.getText(sf))) {
                        const root = expr.name && ts.isIdentifier(expr.name) ? expr.name.getText(sf) : null;
                        if (root)
                            roots.push(root);
                    }
                }
            }
            if (roots.length && node.name && ts.isIdentifier(node.name))
                map.set(node.name.getText(sf), roots);
        }
        if (ts.isConstructorDeclaration(node) || ts.isMethodDeclaration(node)) {
            const body = node.body;
            const statements = body ? body.statements : [];
            for (const s of statements) {
                if (ts.isExpressionStatement(s) && ts.isBinaryExpression(s.expression)) {
                    const be = s.expression;
                    if (be.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(be.left) && be.left.expression && be.left.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isObjectLiteralExpression(be.right)) {
                        const spreads = be.right.properties.filter(p => ts.isSpreadAssignment(p));
                        const roots = [];
                        for (const sp of spreads) {
                            const expr = sp.expression;
                            if (isServiceGetCall(sf, expr, serviceName)) {
                                const arg = expr.arguments[0];
                                if (arg && ts.isStringLiteral(arg))
                                    roots.push(arg.text);
                            }
                            else if (ts.isPropertyAccessExpression(expr)) {
                                const base = expr.expression;
                                if (ts.isPropertyAccessExpression(base) && base.expression && base.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isIdentifier(base.name) && varNames.includes(base.name.getText(sf))) {
                                    const root = expr.name && ts.isIdentifier(expr.name) ? expr.name.getText(sf) : null;
                                    if (root)
                                        roots.push(root);
                                }
                            }
                        }
                        if (roots.length && ts.isIdentifier(be.left.name))
                            map.set(be.left.name.getText(sf), roots);
                    }
                }
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(sf);
    return map;
}
exports.collectVarRootOrder = collectVarRootOrder;
function collectTemplateKeys(html, varNames) {
    const keys = new Set();
    for (const v of varNames) {
        const re = new RegExp(`\\{\\{\\s*${v}\\.([A-Za-z0-9_.]+)`, 'g');
        let m;
        while ((m = re.exec(html)))
            keys.add(m[1]);
    }
    return Array.from(keys);
}
exports.collectTemplateKeys = collectTemplateKeys;
function resolveKeyFromContext(pathStr, htmlKeys) {
    if (pathStr.includes('.'))
        return pathStr;
    const candidates = htmlKeys.filter(k => k.endsWith('.' + pathStr));
    if (candidates.length === 1)
        return candidates[0];
    const preferApp = candidates.find(k => k.startsWith('app.'));
    if (preferApp)
        return preferApp;
    candidates.sort((a, b) => a.split('.').length - b.split('.').length);
    return candidates[0] || pathStr;
}
exports.resolveKeyFromContext = resolveKeyFromContext;
function flatten(obj, prefix = '', out = {}) {
    for (const [k, v] of Object.entries(obj || {})) {
        const key = prefix ? prefix + '.' + k : k;
        if (v && typeof v === 'object')
            flatten(v, key, out);
        else
            out[key] = v;
    }
    return out;
}
exports.flatten = flatten;
function resolveKey(pathStr, packKeys) {
    if (pathStr.includes('.'))
        return pathStr;
    if (packKeys.has(pathStr))
        return pathStr;
    const appKey = 'app.' + pathStr;
    if (packKeys.has(appKey))
        return appKey;
    const candidates = Array.from(packKeys).filter(k => k.endsWith('.' + pathStr));
    if (candidates.length === 1)
        return candidates[0];
    const preferred = candidates.find(k => k.startsWith('app.'));
    if (preferred)
        return preferred;
    return pathStr;
}
exports.resolveKey = resolveKey;
