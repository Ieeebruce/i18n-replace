export type TemplateUse = { varName: string; keyExpr: string; params?: Record<string, string>; dynamicSegments?: string[]; start?: number; end?: number; raw?: string; kind?: 'replace'|'lit'|'dyn'|'prop' } // 模板中的一次使用：变量名、键表达式、参数、动态片段与位置

export function collectTemplateUsages(html: string, varNames: string[]): TemplateUse[] { // 从 HTML 中收集模板使用
  const out: TemplateUse[] = []
  const vn = varNames.join('|')
  // 链式 replace：{{ var.key.replace('{a}', x).replace('{b}', y) }}
  const reReplace = new RegExp(`\\{\\{\\s*(${vn})\\.([A-Za-z0-9_.]+)((?:\\.replace\\([^)]*\\))+)[^}]*\\}\\}`, 'g')
  let m: RegExpExecArray | null
  while ((m = reReplace.exec(html))) {
    const varName = m[1]
    const base = m[2]
    const chain = m[3]
    const params: Record<string, string> = {}
    const rp = /\.replace\(\s*['"]\{([^}]+)\}['"]\s*,\s*([^\)]+)\s*\)/g
    let mm: RegExpExecArray | null
    while ((mm = rp.exec(chain))) params[mm[1]] = mm[2].trim()
    const start = m.index
    const raw = m[0]
    const end = start + raw.length
    out.push({ varName, keyExpr: base, params, start, end, raw, kind: 'replace' })
  }
  // 字面量索引：{{ var.key['lit'] }} 或 {{ var.key["lit"] }}
  const reLit = new RegExp(`\\{\\{\\s*(${vn})\\.([A-Za-z0-9_.]+)\\s*\\[(['"])([^'\"]+)\\3\\]\\s*\\}\\}`, 'g')
  while ((m = reLit.exec(html))) {
    const varName = m[1]
    const base = m[2]
    const lit = m[4]
    const start = m.index
    const raw = m[0]
    const end = start + raw.length
    out.push({ varName, keyExpr: `${base}.${lit}`, start, end, raw, kind: 'lit' })
  }
  // 动态索引：{{ var.key[idx] }}
  const reDyn = new RegExp(`\\{\\{\\s*(${vn})\\.([A-Za-z0-9_.]+)\\s*\\[([^\\]]+)\\]\\s*\\}\\}`, 'g')
  while ((m = reDyn.exec(html))) {
    const varName = m[1]
    const base = m[2]
    const expr = m[3].trim()
    const start = m.index
    const raw = m[0]
    const end = start + raw.length
    out.push({ varName, keyExpr: `'${base}.' + ${expr}`, dynamicSegments: [expr], start, end, raw, kind: 'dyn' })
  }
  // 简单属性：{{ var.key }}
  const reProp = new RegExp(`\\{\\{\\s*(${vn})\\.([A-Za-z0-9_.]+)\\s*\\}\\}`, 'g')
  while ((m = reProp.exec(html))) {
    const start = m.index
    const raw = m[0]
    const end = start + raw.length
    out.push({ varName: m[1], keyExpr: m[2], start, end, raw, kind: 'prop' })
  }
  return out
}
