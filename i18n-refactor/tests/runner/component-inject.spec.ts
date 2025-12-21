import { processComponent } from '../../src/runner/component';
import { config } from '../../src/core/config';
import * as path from 'path';

describe('Component Service Injection', () => {
  const originalVarName = config.serviceVariableName;
  
  beforeAll(() => {
    config.serviceTypeName = 'I18nLocaleService';
    config.serviceVariableName = 'i18n';
  });

  afterAll(() => {
    config.serviceVariableName = originalVarName;
  });

  it('should inject service into constructor if missing and used', () => {
    const tsCode = `
      import { Component } from '@angular/core';
      @Component({})
      export class C {
        m() {
          this.i18n.get('key');
        }
      }
    `;
    const htmlCode = '';
    const { tsOut } = processComponent(tsCode, htmlCode);
    
    expect(tsOut).toContain('constructor(private i18n: I18nLocaleService) {}');
    expect(tsOut).toContain("import { I18nLocaleService } from './i18n';");
  });

  it('should inject service into existing constructor if missing', () => {
    const tsCode = `
      import { Component } from '@angular/core';
      @Component({})
      export class C {
        constructor(private other: OtherService) {}
        m() {
          this.i18n.get('key');
        }
      }
    `;
    const htmlCode = '';
    const { tsOut } = processComponent(tsCode, htmlCode);
    
    expect(tsOut).toContain('constructor(private i18n: I18nLocaleService, private other: OtherService)');
  });

  it('should not inject service if already present with same name', () => {
    const tsCode = `
      import { Component } from '@angular/core';
      import { I18nLocaleService } from './i18n';
      @Component({})
      export class C {
        constructor(private i18n: I18nLocaleService) {}
        m() {
          this.i18n.get('key');
        }
      }
    `;
    const htmlCode = '';
    const { tsOut } = processComponent(tsCode, htmlCode);
    
    // Should not change constructor (except maybe spacing/formatting if touched, but here it shouldn't touch)
    // Actually injectService touches string only if it needs to inject.
    // So output should be same as input (ignoring other processComponent cleanups)
    expect(tsOut).toContain('constructor(private i18n: I18nLocaleService)');
    // Count occurrences
    const matches = tsOut.match(/private i18n: I18nLocaleService/g);
    expect(matches?.length).toBe(1);
  });
  
  it('should use configured service variable name', () => {
    config.serviceVariableName = 'customService';
    const tsCode = `
      import { Component } from '@angular/core';
      @Component({})
      export class C {
        m() {
          this.customService.get('key');
        }
      }
    `;
    const htmlCode = '';
    const { tsOut } = processComponent(tsCode, htmlCode);
    
    expect(tsOut).toContain('constructor(private customService: I18nLocaleService) {}');
    config.serviceVariableName = 'i18n'; // reset
  });
});
