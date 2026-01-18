import * as fs from 'fs';
import * as path from 'path';
import { AnalyzerResult, RefactorManifest, RefactorChange, ValidationResult } from '../core/types';
import { loadDictFile } from '../util/dict-simple';

export class PlanGenerator {
  private tsDicts: Record<string, any> = {};
  private jsonDicts: Record<string, any> = {};
  private languages: string[] = ['zh', 'en']; // TODO: Configurable

  constructor(private tsDictDir: string, private jsonDictDir: string) {}

  async init() {
    // Load all dictionaries
    if (fs.existsSync(this.tsDictDir)) {
      const files = fs.readdirSync(this.tsDictDir).filter(f => f.endsWith('.ts'));
      for (const file of files) {
        const lang = path.basename(file, '.ts');
        if (this.languages.includes(lang)) {
          this.tsDicts[lang] = await loadDictFile(path.join(this.tsDictDir, file));
        }
      }
    }

    if (fs.existsSync(this.jsonDictDir)) {
      const files = fs.readdirSync(this.jsonDictDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const lang = path.basename(file, '.json');
        if (this.languages.includes(lang)) {
          this.jsonDicts[lang] = JSON.parse(fs.readFileSync(path.join(this.jsonDictDir, file), 'utf8'));
        }
      }
    }
  }

  public generate(analysis: AnalyzerResult): RefactorManifest {
    const changes: RefactorChange[] = [];
    let validationFailures = 0;

    for (const usage of analysis.usages) {
      const key = usage.path.join('.');
      const validation = this.validate(usage.path, key);

      if (validation.status === 'FAIL') {
        validationFailures++;
      }

      changes.push({
        file: usage.file,
        start: usage.start,
        end: usage.end,
        originalCode: usage.sourceCode,
        newCode: this.generateNewCode(key, usage.kind, usage.file), // Pass file path
        key: key,
        confidence: validation.status === 'PASS' ? 'HIGH' : 'LOW',
        validation: validation,
        type: usage.file.endsWith('.html') ? 'HTML' : 'TS'
      });
    }

    return {
      changes,
      complexCases: analysis.complexCases,
      stats: {
        totalFiles: new Set(changes.map(c => c.file)).size,
        totalChanges: changes.length,
        validationFailures
      }
    };
  }

  private generateNewCode(key: string, kind: string, filePath?: string): string {
    if (kind === 'declaration_delete') {
      return '';
    } else if (kind === 'interpolation') {
      return `{{ '${key}' | i18n }}`;
    } else if (kind === 'property_access' && !key.includes('(')) { 
        if (filePath && filePath.endsWith('.html')) {
            // HTML attribute binding: [title]="dict.list.items" -> [title]="'list.items' | i18n"
            // We should use pipe if possible.
            return `'${key}' | i18n`;
        }
        return `this.i18n.get({key: '${key}'})`;
    } else {
        // Fallback or complex cases
        return `this.i18n.get({key: '${key}'})`;
    }
  }

  private validate(pathArr: string[], key: string): ValidationResult {
    // Skip validation for declaration deletions (no key involved)
    if (pathArr.length === 0) return { status: 'PASS' };

    // Validate across all languages
    for (const lang of this.languages) {
      const tsVal = this.getValueFromObj(this.tsDicts[lang], pathArr);
      const jsonVal = this.jsonDicts[lang]?.[key];

      if (tsVal === undefined && jsonVal === undefined) continue;

      if (String(tsVal) !== String(jsonVal)) {
        return {
          status: 'FAIL',
          originalValue: String(tsVal),
          newValue: String(jsonVal),
          message: `Mismatch in ${lang}: TS="${tsVal}" vs JSON="${jsonVal}"`
        };
      }
    }

    return { status: 'PASS' };
  }

  private getValueFromObj(obj: any, pathArr: string[]): any {
    let current = obj;
    for (const p of pathArr) {
      if (current && typeof current === 'object') {
        current = current[p];
      } else {
        return undefined;
      }
    }
    return current;
  }
}
