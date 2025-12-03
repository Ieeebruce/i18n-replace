export type TemplateUse = { varName: string; keyExpr: string; params?: Record<string, string>; dynamicSegments?: string[] }

export function collectTemplateUsages(html: string, varNames: string[]): TemplateUse[] {
  return []
}
