import { renderHtmlPipe } from '../../src/replace/html-replace'

test('render html pipe without params', () => {
  const s = renderHtmlPipe({ varName: 'i18n', keyExpr: 'app.title' })
  expect(s).toBe("{{ 'app.title' | i18n }}")
})

test('render html pipe with params', () => {
  const s = renderHtmlPipe({ varName: 'i18n', keyExpr: 'templates.info', params: { name: 'n', count: 'c' } })
  expect(s).toBe("{{ 'templates.info' | i18n: {\"name\":\"n\",\"count\":\"c\"} }}")
})
