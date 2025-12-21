
import * as fs from 'fs'
import * as path from 'path'
import { processTsFile } from '../../src/runner/run-dir'

// Mock fs module
jest.mock('fs')

describe('run-dir processTsFile constructor replacement', () => {
  const mockReadFileSync = fs.readFileSync as jest.Mock
  const mockWriteFileSync = fs.writeFileSync as jest.Mock
  const mockExistsSync = fs.existsSync as jest.Mock
  
  beforeEach(() => {
    jest.clearAllMocks()
    mockExistsSync.mockReturnValue(false)
    // Default mock for readdirSync to avoid errors in other parts if called
    ;(fs.readdirSync as jest.Mock).mockReturnValue([])
  })

  it('should respect existing locale: I18nLocaleService', () => {
    const input = `
      export class MyComponent {
        constructor(private locale: I18nLocaleService) {}
      }
    `
    mockReadFileSync.mockReturnValue(input)
    
    const result = processTsFile('/path/to/file.ts')
    
    expect(result.code).toContain('constructor(private locale: I18nLocaleService)')
    expect(result.changed).toBe(false)
  })

  it('should NOT add i18n service if constructor is empty', () => {
    const input = `
      export class MyComponent {
        constructor() {}
      }
    `
    mockReadFileSync.mockReturnValue(input)
    
    const result = processTsFile('/path/to/file.ts')
    
    expect(result.code).toContain('constructor()')
    expect(result.code).not.toContain('public i18n: I18nLocaleService')
    expect(result.changed).toBe(false)
  })

  it('should NOT add i18n service if constructor has other params but no locale service', () => {
    const input = `
      export class MyComponent {
        constructor(private http: HttpClient) {}
      }
    `
    mockReadFileSync.mockReturnValue(input)
    
    const result = processTsFile('/path/to/file.ts')
    
    expect(result.code).toContain('constructor(private http: HttpClient)')
    expect(result.code).not.toContain('public i18n: I18nLocaleService')
    expect(result.changed).toBe(false)
  })

  it('should keep existing i18n service', () => {
    const input = `
      export class MyComponent {
        constructor(public i18n: I18nLocaleService) {}
      }
    `
    mockReadFileSync.mockReturnValue(input)
    
    const result = processTsFile('/path/to/file.ts')
    
    expect(result.code).toContain('constructor(public i18n: I18nLocaleService)')
    expect(result.changed).toBe(false)
  })
})
