export type TemplateUse = { varName: string; keyExpr: string; params?: Record<string, string>; dynamicSegments?: string[] } // 模板中的一次使用：变量名、键表达式、参数、动态片段

export function collectTemplateUsages(html: string, varNames: string[]): TemplateUse[] { // 从 HTML 中收集模板使用（占位实现）
  return [] // 当前返回空数组，具体实现留待后续
}
