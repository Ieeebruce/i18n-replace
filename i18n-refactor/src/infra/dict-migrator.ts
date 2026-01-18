import * as fs from 'fs';
import * as path from 'path';
import { loadDictFile } from '../util/dict-simple';
import { info, warn } from '../util/logger';

export class DictMigrator {
  constructor(
    private dictDir: string,
    private outDir: string,
    private serviceDir: string
  ) {}

  async run() {
    await this.migrateDictionaries();
    await this.injectService();
  }

  private async migrateDictionaries() {
    if (!fs.existsSync(this.dictDir)) {
      warn(`Dictionary directory not found: ${this.dictDir}`);
      return;
    }

    const files = fs.readdirSync(this.dictDir).filter(f => f.endsWith('.ts'));
    if (!fs.existsSync(this.outDir)) {
      fs.mkdirSync(this.outDir, { recursive: true });
    }

    for (const file of files) {
      const lang = path.basename(file, '.ts');
      const tsPath = path.join(this.dictDir, file);
      
      try {
        const dictData = await loadDictFile(tsPath);
        const flatData: Record<string, string> = {};
        this.flatten(dictData, '', flatData);

        const jsonPath = path.join(this.outDir, `${lang}.json`);
        fs.writeFileSync(jsonPath, JSON.stringify(flatData, null, 2), 'utf8');
        info(`Migrated dictionary: ${tsPath} -> ${jsonPath}`);
      } catch (e) {
        warn(`Failed to migrate dictionary ${file}: ${e}`);
      }
    }
  }

  private flatten(obj: any, prefix: string, out: Record<string, string>) {
    if (obj && typeof obj === 'object') {
      for (const key of Object.keys(obj)) {
        const value = obj[key];
        const newKey = prefix ? `${prefix}.${key}` : key;
        
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          this.flatten(value, newKey, out);
        } else {
          // Convert non-string values to string or keep primitive
          out[newKey] = String(value);
        }
      }
    }
  }

  private async injectService() {
    const servicePath = path.join(this.serviceDir, 'i18n.service.ts');
    if (fs.existsSync(servicePath)) {
      info(`I18nService already exists at ${servicePath}`);
      return;
    }

    if (!fs.existsSync(this.serviceDir)) {
      fs.mkdirSync(this.serviceDir, { recursive: true });
    }

    const templatePath = path.join(__dirname, 'i18n-service.template.ts');
    // We can read the template file directly if it's copied to dist, 
    // or we can embed it as string to be safe.
    // For now, I'll read the file assuming the build process handles it, 
    // but fallback to a hardcoded string if needed. 
    // Actually, reading the TS template might be weird if we are running JS.
    // Let's use a hardcoded string for reliability in this generated file context.
    
    const templateContent = `import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

@Injectable({
  providedIn: 'root'
})
export class I18nService {
  constructor(private translate: TranslateService) {
    // default lang
    this.translate.setDefaultLang('zh');
    this.translate.use('zh');
  }

  /**
   * Get i18n value by key
   * @param options { key: string, params?: any }
   */
  get(options: { key: string, params?: any }): string {
    return this.translate.instant(options.key, options.params);
  }

  /**
   * Get i18n value (Observable)
   * @param options { key: string, params?: any }
   */
  getAsync(options: { key: string, params?: any }) {
    return this.translate.get(options.key, options.params);
  }
}
`;
    
    fs.writeFileSync(servicePath, templateContent, 'utf8');
    info(`Generated I18nService at ${servicePath}`);
  }
}
