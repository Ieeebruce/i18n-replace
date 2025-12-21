import { TemplateUse } from '../core/template-usage' // 引入模板使用类型

export function renderHtmlPipe(use: TemplateUse): string { // 根据使用信息渲染 i18n 管道表达式
  const p = use.params && Object.keys(use.params).length ? `: ${JSON.stringify(use.params)}` : '' // 构建参数部分
  const k = use.keyExpr // 键表达式
  if (/\+/.test(k) || /^\(/.test(k) || /^'\(/.test(k)) return `{{ (${k}) | i18n${p} }}`
  return `{{ '${k}' | i18n${p} }}` // 返回插值字符串
}
