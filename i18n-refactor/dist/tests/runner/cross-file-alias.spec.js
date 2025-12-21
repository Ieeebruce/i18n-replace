"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const component_1 = require("../../src/runner/component");
const config_1 = require("../../src/core/config");
describe('Cross File Alias', () => {
    beforeAll(() => {
        config_1.config.serviceTypeName = 'I18nLocaleService';
    });
    it('should resolve aliases from injected services', () => {
        const tsCode = `
      import { Component } from '@angular/core';
      import { ExampleService } from './service';
      
      @Component({})
      export class C {
        i18n: any;
        constructor(private exampleService: ExampleService) {
          this.i18n = this.exampleService.i18n;
          const t = this.i18n.title;
        }
      }
    `;
        // Mock external aliases map
        // ExampleService.i18n is an alias to 'app'
        const externalAliases = new Map();
        externalAliases.set('ExampleService', [
            { name: 'i18n', prefix: 'app', roots: [] }
        ]);
        // Note: We need to modify processComponent to accept externalAliases first.
        // Since we haven't modified it yet, this test is expected to fail or not compile if we pass the argument.
        // For now, I will write the test assuming the API *will* be there, and then modify the code.
        // @ts-ignore
        const { tsOut } = (0, component_1.processComponent)(tsCode, '', undefined, externalAliases);
        expect(tsOut).toContain("this.i18n.get('app.title')");
    });
});
