import { renderTsGet } from '../../src/replace/ts-replace'

test('render ts get without params', () => {
  const s = renderTsGet('i18n', { keyExpr: 'app.title' })
  expect(s).toBe("this.i18n.get('app.title')")
})

test('render ts get with params', () => {
  const s = renderTsGet('i18n', { keyExpr: 'templates.info', params: { name: 'n', count: 'c' } })
  expect(s).toBe("this.i18n.get('templates.info', {\"name\":\"n\",\"count\":\"c\"})")
})
