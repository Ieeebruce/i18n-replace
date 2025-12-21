"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dict_reader_1 = require("../../src/util/dict-reader");
test('pickRoot selects app when both roots have common.desc', () => {
    expect((0, dict_reader_1.pickRoot)(['common', 'app'], 'common.desc')).toBe('app');
});
test('pickRoot selects app for app.footer', () => {
    expect((0, dict_reader_1.pickRoot)(['common', 'app'], 'footer')).toBe('app');
});
test('pickRoot selects app for app.footer', () => {
    expect((0, dict_reader_1.pickRoot)(['common', 'app'], 'onlyCommon')).toBe('common');
});
