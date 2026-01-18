import * as fs from 'fs';
import * as path from 'path';
import { ProjectAnalyzer } from '../analyzer/project-analyzer';
import { DictMigrator } from '../infra/dict-migrator';
import { PlanGenerator } from '../planner/plan-generator';
import { CodeMod } from '../transformer/code-mod';
import { ComponentInjectTransformer } from '../transformer/component-inject';
import { config } from '../core/config';
import { info } from '../util/logger';

const CACHE_DIR = '.i18n-refactor-cache';
const ANALYSIS_FILE = path.join(CACHE_DIR, 'analysis.json');
const PLAN_FILE = path.join(CACHE_DIR, 'plan.json');

export class Orchestrator {
  
  static async scan() {
    this.ensureCache();
    const analyzer = new ProjectAnalyzer('tsconfig.json', { getLocaleMethod: config.getLocalMethod });
    const result = await analyzer.analyze();
    fs.writeFileSync(ANALYSIS_FILE, JSON.stringify(result, null, 2));
    info(`Scan complete. Analysis saved to ${ANALYSIS_FILE}`);
  }

  static async migrate() {
    const migrator = new DictMigrator(
      config.dictDir || 'src/app/i18n',
      'src/assets/i18n', // Target JSON dir
      'src/app/core/i18n' // Service dir
    );
    await migrator.run();
  }

  static async plan() {
    if (!fs.existsSync(ANALYSIS_FILE)) {
      throw new Error('Analysis file not found. Run "scan" first.');
    }
    const analysis = JSON.parse(fs.readFileSync(ANALYSIS_FILE, 'utf8'));
    
    const generator = new PlanGenerator(
      config.dictDir || 'src/app/i18n',
      'src/assets/i18n'
    );
    await generator.init();
    
    const manifest = generator.generate(analysis);
    fs.writeFileSync(PLAN_FILE, JSON.stringify(manifest, null, 2));
    info(`Plan generated. Manifest saved to ${PLAN_FILE}. Run "ui" to review.`);
  }

  static async apply() {
    if (!fs.existsSync(PLAN_FILE)) {
      throw new Error('Plan file not found. Run "plan" first.');
    }
    const manifest = JSON.parse(fs.readFileSync(PLAN_FILE, 'utf8'));
    
    // 1. Apply replacements
    const codemod = new CodeMod();
    await codemod.apply(manifest);

    // 2. Post-process: Inject Service & Imports
    const injector = new ComponentInjectTransformer();
    const affectedFiles = new Set(manifest.changes.map((c: any) => c.file));
    
    for (const file of Array.from(affectedFiles)) {
        if (typeof file === 'string') {
            if (file.endsWith('.ts')) {
                injector.processFile(file);
            } else if (file.endsWith('.html')) {
                // Find corresponding TS file
                const tsFile = file.replace('.html', '.ts');
                if (fs.existsSync(tsFile)) {
                    injector.processFile(tsFile);
                }
            }
        }
    }
  }

  private static ensureCache() {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR);
    }
  }
}
