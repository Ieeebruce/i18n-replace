import { processComponent } from '../../src/runner/component'

test('component runner returns original when no changes', () => {
  const r = processComponent('class A {}', '<div></div>')
  expect(r.tsOut).toBe('class A {}')
  expect(r.htmlOut).toBe('<div></div>')
})
