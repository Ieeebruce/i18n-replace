import { TemplateUse } from '../core/template-usage'

export function renderHtmlPipe(use: TemplateUse): string {
  const p = use.params && Object.keys(use.params).length ? `: ${JSON.stringify(use.params)}` : ''
  const k = use.keyExpr
  return `{{ '${k}' | i18n${p} }}`
}
