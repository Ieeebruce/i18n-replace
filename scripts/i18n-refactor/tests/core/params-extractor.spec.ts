import { extractReplaceParams } from '../../src/core/params-extractor'

test('extract replace chain params', () => {
  const chain = `.replace('{name}', name).replace('{count}', n)`
  const p = extractReplaceParams(chain)
  expect(p).toEqual({ name: 'name', count: 'n' })
})
