"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const params_extractor_1 = require("../../src/core/params-extractor");
test('extract replace chain params', () => {
    const chain = `.replace('{name}', name).replace('{count}', n)`;
    const p = (0, params_extractor_1.extractReplaceParams)(chain);
    expect(p).toEqual({ name: 'name', count: 'n' });
});
