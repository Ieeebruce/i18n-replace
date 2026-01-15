import * as fs from 'fs';
import * as path from 'path';
import { ensureAngularFiles } from '../../src/processor/ensure-angular-mode';

// Simple mock implementation
const mockReadFileSync = jest.fn();
const mockWriteFileSync = jest.fn();
const mockExistsSync = jest.fn();
const mockMkdirSync = jest.fn();

// Mock the fs module
jest.mock('fs', () => ({
  readFileSync: (file: string, options: any) => mockReadFileSync(file, options),
  writeFileSync: (file: string, data: any, options: any) => mockWriteFileSync(file, data, options),
  existsSync: (file: string) => mockExistsSync(file),
  mkdirSync: (dir: string, options: any) => mockMkdirSync(dir, options),
}));

// Mock path module
jest.mock('path', () => ({
  join: (...args: string[]) => args.join('/'),
}));

describe('ensureAngularFiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mocks
    mockExistsSync.mockReturnValue(false); // Assume files don't exist initially
    mockReadFileSync.mockReturnValue('mocked file content');
  });

  it('should create adapter service when mode is fix and file does not exist', () => {
    mockExistsSync.mockReturnValueOnce(false); // adapter doesn't exist
    mockExistsSync.mockReturnValueOnce(false); // service doesn't exist
    mockExistsSync.mockReturnValueOnce(false); // pipe doesn't exist
    
    ensureAngularFiles('src/app/i18n', 'fix');

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      'process.cwd()/src/app/i18n/i18n-adapter.ts',
      expect.stringContaining('I18nAdapterService'),
      'utf8'
    );
  });

  it('should create service when mode is fix and file does not exist', () => {
    mockExistsSync.mockReturnValueOnce(false); // adapter doesn't exist
    mockExistsSync.mockReturnValueOnce(false); // service doesn't exist
    mockExistsSync.mockReturnValueOnce(false); // pipe doesn't exist
    
    ensureAngularFiles('src/app/i18n', 'fix');

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      'process.cwd()/src/app/i18n/index.ts',
      expect.stringContaining('I18nLocaleService'),
      'utf8'
    );
  });

  it('should create pipe when mode is fix and file does not exist', () => {
    mockExistsSync.mockReturnValueOnce(false); // adapter doesn't exist
    mockExistsSync.mockReturnValueOnce(false); // service doesn't exist
    mockExistsSync.mockReturnValueOnce(false); // pipe doesn't exist
    
    ensureAngularFiles('src/app/i18n', 'fix');

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      'process.cwd()/src/app/i18n/i18n.pipe.ts',
      expect.stringContaining('I18nPipe'),
      'utf8'
    );
  });

  it('should not create files when mode is report', () => {
    mockExistsSync.mockReturnValueOnce(false); // adapter doesn't exist
    mockExistsSync.mockReturnValueOnce(false); // service doesn't exist
    mockExistsSync.mockReturnValueOnce(false); // pipe doesn't exist
    
    ensureAngularFiles('src/app/i18n', 'report');

    // Should not call writeFileSync since mode is 'report'
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('should handle existing app.config.ts and add service to providers', () => {
    mockExistsSync.mockReturnValueOnce(false); // adapter doesn't exist
    mockExistsSync.mockReturnValueOnce(false); // service doesn't exist
    mockExistsSync.mockReturnValueOnce(false); // pipe doesn't exist
    mockExistsSync.mockReturnValueOnce(true); // app.config.ts exists
    
    const mockConfigContent = `import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';

export const appConfig: ApplicationConfig = {
  providers: [provideRouter([])]
};`;

    mockReadFileSync.mockReturnValueOnce(mockConfigContent);

    ensureAngularFiles('src/app/i18n', 'fix');

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      'process.cwd()/src/app/app.config.ts',
      expect.stringContaining('I18nLocaleService'),
      'utf8'
    );
  });

  it('should handle existing app.component.ts and add pipe to imports', () => {
    mockExistsSync.mockReturnValueOnce(false); // adapter doesn't exist
    mockExistsSync.mockReturnValueOnce(false); // service doesn't exist
    mockExistsSync.mockReturnValueOnce(false); // pipe doesn't exist
    mockExistsSync.mockReturnValueOnce(true); // app.component.ts exists
    
    const mockComponentContent = `import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'app';
}`;

    mockReadFileSync.mockReturnValueOnce(mockComponentContent);

    ensureAngularFiles('src/app/i18n', 'fix');

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      'process.cwd()/src/app/app.component.ts',
      expect.stringContaining('I18nPipe'),
      'utf8'
    );
  });
});