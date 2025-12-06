import { pickRoot } from '../../src/util/dict-reader'

test('pickRoot selects app when both roots have common.desc', () => {
  expect(pickRoot(['common', 'app'], 'common.desc')).toBe('app')
})

test('pickRoot selects app for app.footer', () => {
  expect(pickRoot(['common', 'app'], 'footer')).toBe('app')
})

test('pickRoot selects app for app.footer', () => {
  expect(pickRoot(['common', 'app'], 'onlyCommon')).toBe('common')
})
