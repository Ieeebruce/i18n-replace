"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const component_1 = require("../../src/runner/component");
test('component runner returns original when no changes', () => {
    const r = (0, component_1.processComponent)('class A {}', '<div></div>');
    expect(r.tsOut).toBe('class A {}');
    expect(r.htmlOut).toBe('<div></div>');
});
