"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const run_dir_1 = require("../../src/runner/run-dir");
// Mock fs module
jest.mock('fs');
describe('run-dir processTsFile constructor replacement', () => {
    const mockReadFileSync = fs.readFileSync;
    const mockWriteFileSync = fs.writeFileSync;
    const mockExistsSync = fs.existsSync;
    beforeEach(() => {
        jest.clearAllMocks();
        mockExistsSync.mockReturnValue(false);
        fs.readdirSync.mockReturnValue([]);
    });
    it('should respect existing locale: I18nLocaleService', () => {
        const input = `
      export class MyComponent {
        constructor(private locale: I18nLocaleService) {}
      }
    `;
        mockReadFileSync.mockReturnValue(input);
        const result = (0, run_dir_1.processTsFile)('/path/to/file.ts');
        expect(result.code).toContain('constructor(private locale: I18nLocaleService)');
        expect(result.changed).toBe(false);
    });
    it('should NOT add i18n service if constructor is empty', () => {
        const input = `
      export class MyComponent {
        constructor() {}
      }
    `;
        mockReadFileSync.mockReturnValue(input);
        const result = (0, run_dir_1.processTsFile)('/path/to/file.ts');
        expect(result.code).toContain('constructor()');
        expect(result.code).not.toContain('public i18n: I18nLocaleService');
        expect(result.changed).toBe(false);
    });
    it('should NOT add i18n service if constructor has other params but no locale service', () => {
        const input = `
      export class MyComponent {
        constructor(private http: HttpClient) {}
      }
    `;
        mockReadFileSync.mockReturnValue(input);
        const result = (0, run_dir_1.processTsFile)('/path/to/file.ts');
        expect(result.code).toContain('constructor(private http: HttpClient)');
        expect(result.code).not.toContain('public i18n: I18nLocaleService');
        expect(result.changed).toBe(false);
    });
    it('should keep existing i18n service', () => {
        const input = `
      export class MyComponent {
        constructor(public i18n: I18nLocaleService) {}
      }
    `;
        mockReadFileSync.mockReturnValue(input);
        const result = (0, run_dir_1.processTsFile)('/path/to/file.ts');
        expect(result.code).toContain('constructor(public i18n: I18nLocaleService)');
        expect(result.changed).toBe(false);
    });
});
