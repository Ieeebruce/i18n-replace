import ts from 'typescript'

export function pruneUnused(sf: ts.SourceFile, code: string, varNames: string[]): string {
  let out = code
  for (const v of varNames) {
    const reAssign = new RegExp('this\\.' + v + '\\s*=\\s*[^;]*\\.' + 'getLocal' + '\\([^)]*\\)\\s*;', 'g')
    const reDeclTyped = new RegExp(`\b${v}\s*:\s*[^;]+;`, 'g')
    const reDeclBare = new RegExp(`\b${v}\s*;`, 'g')
    out = out.replace(reAssign, '')
    out = out.replace(reDeclTyped, '')
    out = out.replace(reDeclBare, '')
    out = out.replace(new RegExp(`\b${v}\s*:\s*any\s*;`, 'g'), '')
  }
  out = out.replace(/\blocal\s*:\s*any\s*;/g, '')
  return out
}
