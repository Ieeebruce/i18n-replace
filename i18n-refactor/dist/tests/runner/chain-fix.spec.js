"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const component_1 = require("../../src/runner/component");
const config_1 = require("../../src/core/config");
describe('Chain Fix', () => {
    beforeAll(() => {
        config_1.config.serviceTypeName = 'I18nLocaleService';
    });
    it('should handle chained replace calls correctly without double replacement', () => {
        const tsCode = `
      import { I18nLocaleService } from '../i18n';
      @Component({})
      export class C {
        L = this.i18n.getLocale();
        constructor(public i18n: I18nLocaleService) {}
        foo() {
          this.info = this.L.templates.info.replace('{name}', '李四').replace('{count}', '2');
        }
      }
    `;
        const htmlCode = '';
        const { tsOut } = (0, component_1.processComponent)(tsCode, htmlCode);
        expect(tsOut).toContain("this.info = this.i18n.get('templates.info', {name:'李四', count:'2'})");
        expect(tsOut).not.toContain("this.i18n.get('templates.info', {name:'李四'})t:'2'});");
    });
});
