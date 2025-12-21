"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const component_1 = require("../../src/runner/component");
describe('AliasGetterComponent', () => {
    it('should handle cross-file alias and remove assignment', () => {
        const code = `
      import { Component } from '@angular/core';
      import { ExampleService } from './service';
      
      @Component({})
      export class AliasGetterComponent {
        title = '';
        info = '';
        i18n: any;
        L: any;
        constructor(public locale: I18nLocaleService, private exampleService: ExampleService) {
          this.L = this.locale.getLocale().app;
          this.title = this.L.home.welcome
          this.info = this.L.templates.info.replace('{name}', '李四').replace('{count}', '2');
          this.i18n = this.exampleService.i18n;
          this.title = this.i18n.title;
        }
      }
    `;
        const externalAliases = new Map();
        externalAliases.set('ExampleService', [
            { name: 'i18n', prefix: 'app', roots: [] }
        ]);
        // @ts-ignore
        const { tsOut } = (0, component_1.processComponent)(code, '', 'src/app/test.ts', externalAliases);
        console.log(tsOut);
        // Check replacement of this.L
        expect(tsOut).toContain("this.locale.get('app.home.welcome')");
        // Check replacement of replace chain
        // Should be: this.locale.get('app.templates.info', {name:'李四', count:'2'})
        expect(tsOut).toContain("this.locale.get('app.templates.info', {name:'李四', count:'2'})");
        // Check removal of assignment
        // this.i18n = this.exampleService.i18n; should be removed
        expect(tsOut).not.toContain("this.i18n = this.exampleService.i18n");
        // Check replacement of this.i18n.title
        expect(tsOut).toContain("this.locale.get('app.title')");
    });
});
