import { collectTemplateUsages } from '../src/core/template-usage'
import { renderHtmlPipe } from '../src/replace/html-replace'

const html = `
{{ i18n.user.name }}
{{ i18n.user['age'] }}
{{ i18n.user[ idx ] }}
{{ dict.title.replace('{who}', me).replace('{when}', now) }}
`

test('collectTemplateUsages + renderHtmlPipe basic', () => {
  const uses = collectTemplateUsages(html, ['i18n','dict'])
  const pipes = uses.map(u => renderHtmlPipe(u))
  const all = pipes.join('\n')
  expect(all.includes("{{ 'user.name' | i18n }}")).toBe(true)
  expect(all.includes("{{ 'user.age' | i18n }}")).toBe(true)
  expect(all.includes("| i18n")).toBe(true)
  expect(all.includes("i18n: {")).toBe(true)
})

process.stdout.write('template-usage.spec passed\n')
