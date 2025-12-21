"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const component_1 = require("../../src/runner/component");
const dict_reader_1 = require("../../src/util/dict-reader");
beforeAll(() => {
    (0, dict_reader_1.setMockDict)({
        'common': new Set(['common.title']),
        'app': new Set(['app.desc'])
    });
});
test('merge: dict alias from spreads common+app', () => {
    const ts = `class C { 
    dict: any;
    constructor(private locale: I18nLocaleService){
      this.dict = { ...this.locale.getLocale().common, ...this.locale.getLocale().app }
    } 
    ng(){ 
      console.log(this.dict.common.title);
      console.log(this.dict.app.desc) 
    }
    text() {
      
    }
   }`;
    const html = `<p>{{ dict.common.title }}</p><p>{{ dict.app.desc }}</p>`;
    const out = (0, component_1.processComponent)(ts, html);
    const htmlOutNormalized = out.htmlOut.replace(/\s/g, '');
    expect(htmlOutNormalized.includes("{{'common.common.title'|i18n}}") ||
        htmlOutNormalized.includes("{{'app.common.title'|i18n}}")).toBe(true);
    expect(htmlOutNormalized.includes("{{'common.app.desc'|i18n}}") ||
        htmlOutNormalized.includes("{{'app.app.desc'|i18n}}")).toBe(true);
});
