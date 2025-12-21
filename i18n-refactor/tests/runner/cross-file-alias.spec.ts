import { processComponent } from '../../src/runner/component';
import { config } from '../../src/core/config';
import { VarAlias } from '../../src/core/var-alias';

describe('Cross File Alias', () => {
  beforeAll(() => {
    config.serviceTypeName = 'I18nLocaleService';
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
    const externalAliases = new Map<string, VarAlias[]>();
    externalAliases.set('ExampleService', [
      { name: 'i18n', prefix: 'app', roots: [] }
    ]);

    // Note: We need to modify processComponent to accept externalAliases first.
    // Since we haven't modified it yet, this test is expected to fail or not compile if we pass the argument.
    // For now, I will write the test assuming the API *will* be there, and then modify the code.
    
    // @ts-ignore
    const { tsOut } = processComponent(tsCode, '', undefined, externalAliases);
    
    expect(tsOut).toContain("this.i18n.get('app.title')");
  });
});
