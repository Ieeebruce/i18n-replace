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
exports.ensureAngularFiles = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const logger_1 = require("../util/logger");
// 生成国际化适配器服务
function generateI18nAdapterService() {
    return `import { Injectable, signal, computed } from '@angular/core';
import { en } from './en';
import { zh } from './zh';

export type ZH = typeof zh;

@Injectable({ providedIn: 'root' })
export class I18nAdapterService {
  private langSignal = signal<'zh' | 'en'>('zh');
  private cacheSignal = signal<any>(null);
  
  // 响应式语言状态
  lang = this.langSignal.asReadonly();
  
  // 响应式词条包
  locale = computed(() => {
    const currentLang = this.langSignal();
    const cachedLang = localStorage.getItem('i18n-lang');
    
    if (cachedLang && ['zh', 'en'].includes(cachedLang)) {
      this.langSignal.set(cachedLang as 'zh' | 'en');
    }
    
    const result = currentLang === 'en' ? en : zh;
    this.cacheSignal.set(result);
    return result;
  });
  
  constructor() {
    // 初始化语言
    const cachedLang = localStorage.getItem('i18n-lang');
    if (cachedLang && ['zh', 'en'].includes(cachedLang)) {
      this.langSignal.set(cachedLang as 'zh' | 'en');
    } else {
      // 尝试从浏览器语言检测
      const browserLang = navigator.language.substring(0, 2);
      if (['zh', 'en'].includes(browserLang)) {
        this.langSignal.set(browserLang as 'zh' | 'en');
      }
    }
  }

  // 切换语言
  setLang(lang: 'zh' | 'en') {
    this.langSignal.set(lang);
    localStorage.setItem('i18n-lang', lang);
  }
}
`;
}
// 生成国际化管道
function generateI18nPipe() {
    return `import { Pipe, PipeTransform } from '@angular/core';
import { I18nAdapterService } from './i18n-adapter';

@Pipe({ name: 'i18n', pure: false })
export class I18nPipe implements PipeTransform {
  constructor(private i18n: I18nAdapterService) {}

  transform(key: string, params?: Record<string, any>): string {
    const value = this.getNestedValue(this.i18n.locale(), key);
    if (value === undefined) {
      console.warn(\`Missing translation for key: \${key}\`);
      return key;
    }
    
    let result = String(value);
    if (params) {
      for (const [paramKey, paramValue] of Object.entries(params)) {
        result = result.replace(new RegExp(\`\\\${paramKey}\\\`, 'g'), String(paramValue));
      }
    }
    
    return result;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, part) => current?.[part], obj);
  }
}
`;
}
// 生成国际化索引文件
function generateIndexFile() {
    return `export * from './i18n-adapter';
export * from './i18n.pipe';
`;
}
function ensureAngularFiles(dictDir, mode) {
    const svcPath = path.join(process.cwd(), 'src/app/i18n/index.ts');
    const pipePath = path.join(process.cwd(), 'src/app/i18n/i18n.pipe.ts');
    const adapterPath = path.join(process.cwd(), 'src/app/i18n/i18n-adapter.ts');
    const hasSvc = fs.existsSync(svcPath);
    const hasPipe = fs.existsSync(pipePath);
    const hasAdapter = fs.existsSync(adapterPath);
    // 创建国际化适配器服务
    if (!hasAdapter && mode === 'fix') {
        const adapter = generateI18nAdapterService();
        const dir = path.dirname(adapterPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(adapterPath, adapter, 'utf8');
        (0, logger_1.info)('created i18n adapter service', { file: adapterPath });
    }
    else if (hasAdapter) {
        (0, logger_1.info)('i18n adapter service already exists', { file: adapterPath });
    }
    else {
        (0, logger_1.warn)('missing i18n adapter service', { suggest: 'create src/app/i18n/i18n-adapter.ts' });
    }
    // 创建国际化管道
    if (!hasPipe && mode === 'fix') {
        const pipe = generateI18nPipe();
        const dir = path.dirname(pipePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(pipePath, pipe, 'utf8');
        (0, logger_1.info)('created i18n pipe', { file: pipePath });
    }
    else if (hasPipe) {
        (0, logger_1.info)('i18n pipe already exists', { file: pipePath });
    }
    else {
        (0, logger_1.warn)('missing i18n pipe', { suggest: 'create src/app/i18n/i18n.pipe.ts' });
    }
    // 创建索引文件
    if (!hasSvc && mode === 'fix') {
        const index = generateIndexFile();
        const dir = path.dirname(svcPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(svcPath, index, 'utf8');
        (0, logger_1.info)('created i18n index', { file: svcPath });
    }
    else if (hasSvc) {
        (0, logger_1.info)('i18n index already exists', { file: svcPath });
    }
    else {
        (0, logger_1.warn)('missing i18n index', { suggest: 'create src/app/i18n/index.ts' });
    }
}
exports.ensureAngularFiles = ensureAngularFiles;
