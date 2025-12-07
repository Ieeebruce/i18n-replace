"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dict_reader_1 = require("../src/util/dict-reader");
test('hasKey is available', () => {
    expect(typeof dict_reader_1.hasKey).toBe('function');
});
