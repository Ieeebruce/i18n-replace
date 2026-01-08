import { loadConfigFromArgs, loadConfigFromEnv, deepMerge, defaults } from '../../src/core/config';

describe('Config System', () => {
  describe('deepMerge', () => {
    it('should merge objects correctly', () => {
      // 使用更通用的类型来避免 TypeScript 严格类型检查
      const base: Record<string, any> = { a: 1, b: { c: 2 } };
      const extra: Record<string, any> = { b: { d: 3 }, e: 4 };
      const result = deepMerge(base, extra);
      
      expect(result).toEqual({ a: 1, b: { c: 2, d: 3 }, e: 4 });
    });

    it('should override arrays', () => {
      const base = { languages: ['zh'] };
      const extra = { languages: ['zh', 'en', 'ja'] };
      const result = deepMerge(base, extra);
      
      expect(result).toEqual({ languages: ['zh', 'en', 'ja'] });
    });

    it('should preserve base properties when extra has undefined values', () => {
      const base = { a: 1, b: 2 };
      const extra = { b: undefined, c: 3 };
      const result = deepMerge(base, extra);
      
      expect(result).toEqual({ a: 1, b: 2, c: 3 });
    });
  });

  describe('loadConfigFromArgs', () => {
    it('should parse boolean values correctly', () => {
      const args = ['--dry-run'];
      const result = loadConfigFromArgs(args);
      
      expect(result.dryRun).toBe(true);
    });

    it('should parse number values correctly', () => {
      const args = ['--port=3000'];
      const result = loadConfigFromArgs(args);
      
      expect(result.port).toBe(3000);
    });

    it('should parse array values correctly', () => {
      const args = ['--languages=zh,en,ja'];
      const result = loadConfigFromArgs(args);
      
      expect(result.languages).toEqual(['zh', 'en', 'ja']);
    });

    it('should parse kebab-case keys to camelCase', () => {
      const args = ['--service-type-name=MyService', '--get-local-method=getText'];
      const result = loadConfigFromArgs(args);
      
      expect(result.serviceTypeName).toBe('MyService');
      expect(result.getLocalMethod).toBe('getText');
    });
  });

  describe('loadConfigFromEnv', () => {
    it('should load environment variables with prefix', () => {
      process.env.I18N_REFACTOR_DRY_RUN = 'true';
      process.env.I18N_REFACTOR_PORT = '4000';
      process.env.I18N_REFACTOR_LANGUAGES = 'zh,en';
      
      const result = loadConfigFromEnv();
      
      expect(result.dryRun).toBe(true);
      expect(result.port).toBe(4000);
      expect(result.languages).toEqual(['zh', 'en']);
      
      // Clean up
      delete process.env.I18N_REFACTOR_DRY_RUN;
      delete process.env.I18N_REFACTOR_PORT;
      delete process.env.I18N_REFACTOR_LANGUAGES;
    });
  });

  describe('defaults', () => {
    it('should have correct default values', () => {
      expect(defaults.serviceTypeName).toBe('I18nLocaleService');
      expect(defaults.serviceVariableName).toBe('i18n');
      expect(defaults.getLocalMethod).toBe('getLocale');
      expect(defaults.dictDir).toBe('src/app/i18n');
      expect(defaults.languages).toEqual(['zh', 'en']);
      expect(defaults.jsonOutDir).toBe('i18n-refactor/out');
      expect(defaults.jsonArrayMode).toBe('nested');
      expect(defaults.dryRun).toBe(false);
      expect(defaults.logLevel).toBe('info');
      expect(defaults.format).toBe('json');
      expect(defaults.port).toBe(3002);
    });
  });
});
