import * as fs from 'fs'
import * as path from 'path'
import ts from 'typescript'

function read(p: string) { return fs.readFileSync(p, 'utf8') }

function flattenObjectLit(obj: ts.ObjectLiteralExpression, base: string, out: Record<string,string|any>, arrayMode: 'nested'|'flat') {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    const name = ts.isIdentifier(prop.name) ? prop.name.text : ts.isStringLiteral(prop.name) ? prop.name.text : ''
    if (!name) continue
    const next = base ? `${base}.${name}` : name
    const init = prop.initializer
    if (init && ts.isObjectLiteralExpression(init)) {
      flattenObjectLit(init, next, out, arrayMode)
    } else if (init && ts.isArrayLiteralExpression(init)) {
      if (arrayMode === 'nested') {
        out[next] = init.elements.map(el => ts.isStringLiteral(el) ? el.text : el.getText())
      } else {
        init.elements.forEach((el, idx) => { const v = ts.isStringLiteral(el) ? el.text : el.getText(); out[`${next}.${idx}`] = v })
      }
    } else if (init && ts.isStringLiteral(init)) {
      out[next] = init.text
    } else {
      out[next] = init?.getText() || ''
    }
  }
}

export function flattenLangFile(fp: string, arrayMode: 'nested'|'flat'): Record<string,string|any> {
  const text = read(fp)
  const sf = ts.createSourceFile(fp, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const out: Record<string,string|any> = {}
  const visit = (node: ts.Node) => {
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (!decl.initializer) continue
        let top: ts.ObjectLiteralExpression | null = null
        if (ts.isObjectLiteralExpression(decl.initializer)) top = decl.initializer
        else if (ts.isAsExpression(decl.initializer) && ts.isObjectLiteralExpression(decl.initializer.expression)) top = decl.initializer.expression
        if (!top) continue
        for (const prop of top.properties) {
          if (!ts.isPropertyAssignment(prop)) continue
          const root = ts.isIdentifier(prop.name) ? prop.name.text : ts.isStringLiteral(prop.name) ? prop.name.text : ''
          if (!root) continue
          if (prop.initializer && ts.isObjectLiteralExpression(prop.initializer)) flattenObjectLit(prop.initializer, root, out, arrayMode)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

export function writeJson(outDir: string, lang: string, data: Record<string,string|any>) {
  fs.mkdirSync(outDir, { recursive: true })
  const fp = path.join(outDir, `${lang}.json`)
  fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8')
}
