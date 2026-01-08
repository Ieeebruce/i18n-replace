import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';
import { processComponent, ComplexCase } from './component';
import { ExternalAliasMap } from '../types/var-alias';

export interface FileResult {
  tsPath: string;
  tsBefore: string;
  tsAfter: string;
  htmlPath: string | null;
  htmlBefore: string;
  htmlAfter: string;
  changed: boolean;
  aliases: string[];
  complexCases: ComplexCase[];
}

function readFile(p: string): string {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (e) {
    return '';
  }
}

export function processFile(tsPath: string, externalAliases?: ExternalAliasMap): FileResult {
  const tsBefore = readFile(tsPath);
  const sf = ts.createSourceFile(tsPath, tsBefore, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  
  // detect Angular Component and templateUrl
  let htmlPath: string | null = null;
  const visit = (node: ts.Node) => {
    if (ts.isClassDeclaration(node)) {
      const decos = ts.canHaveDecorators(node) ? ts.getDecorators(node) : undefined;
      for (const d of decos || []) {
        const expr = d.expression;
        if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === 'Component') {
          const arg = expr.arguments[0];
          if (arg && ts.isObjectLiteralExpression(arg)) {
            for (const prop of arg.properties) {
              if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === 'templateUrl') {
                const v = prop.initializer;
                if (v && ts.isStringLiteral(v)) {
                  const dir = path.dirname(tsPath);
                  htmlPath = path.resolve(dir, v.text);
                }
              }
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  const htmlBefore = htmlPath && fs.existsSync(htmlPath) ? readFile(htmlPath) : '';
  const { tsOut, htmlOut, aliases, complexCases: rawComplexCases } = processComponent(tsBefore, htmlBefore, tsPath, externalAliases);
  
  const complexCases = rawComplexCases.map(c => ({ ...c, file: tsPath }));
  const changedTs = tsOut !== tsBefore;
  const changedHtml = htmlPath ? (htmlOut !== htmlBefore) : false;

  return {
    tsPath,
    tsBefore,
    tsAfter: tsOut,
    htmlPath,
    htmlBefore,
    htmlAfter: htmlOut,
    changed: changedTs || changedHtml,
    aliases: aliases,
    complexCases
  };
}
