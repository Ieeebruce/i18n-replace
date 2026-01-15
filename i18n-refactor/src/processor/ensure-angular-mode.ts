import * as fs from 'fs'
import * as path from 'path'
import { info, warn } from '../util/logger'
import { IOError } from '../util/errors'

function readFile(p: string): string { 
  try {
    return fs.readFileSync(p, 'utf8'); 
  } catch (error) {
    throw new IOError(`Failed to read file: ${p}`, p);
  }
}

function writeFile(p: string, s: string) { 
  try {
    fs.writeFileSync(p, s, 'utf8'); 
  } catch (error) {
    throw new IOError(`Failed to write file: ${p}`, p);
  }
}

export function ensureAngularFiles(dictDir: string, mode: 'report'|'fix') {
  const svcPath = path.join(process.cwd(), 'src/app/i18n/index.ts')
  const pipePath = path.join(process.cwd(), 'src/app/i18n/i18n.pipe.ts')
  const adapterPath = path.join(process.cwd(), 'src/app/i18n/i18n-adapter.ts')
  const hasSvc = fs.existsSync(svcPath)
  const hasPipe = fs.existsSync(pipePath)
  const hasAdapter = fs.existsSync(adapterPath)
  
  // 创建国际化适配器服务
  if (!hasAdapter && mode === 'fix') {
    const adapter = `import { Injectable, signal, computed } from '@angular/core';
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
    }
  }
  
  /**
   * 获取当前语言的词条包对象 (兼容旧模式)
   */
  getLocale(): typeof zh {
    const currentLang = this.langSignal();
    return currentLang === 'en' ? en as any : zh;
  }
  
  /**
   * 获取词条 (新模式)
   * @param key 词条键名，如 'app.title'
   * @param params 参数对象，如 { name: '张三', count: 5 }
   */
  get(key: string, params?: Record<string, unknown>): string {
    const pack: any = this.getLocale();
    const val = key.split('.').reduce((o, k) => (o ? o[k] : undefined), pack);
    let s = typeof val === 'string' ? val : '';
    
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), String(v));
      }
    }
    
    return s;
  }
  
  /**
   * 设置语言
   * @param code 语言代码 'zh' | 'en'
   */
  setLang(code: 'en' | 'zh'): void {
    this.langSignal.set(code);
    localStorage.setItem('i18n-lang', code);
    // 注意：在实际应用中，我们可能需要触发更新而不是刷新页面
    // 但在适配器中，为了兼容旧代码，我们保留刷新机制
    // window.location.reload();
  }
  
  /**
   * 检查词条是否存在
   * @param key 词条键名
   */
  hasKey(key: string): boolean {
    const pack: any = this.getLocale();
    const val = key.split('.').reduce((o, k) => (o ? o[k] : undefined), pack);
    return typeof val === 'string';
  }
  
  /**
   * 安全获取词条，如果不存在则返回默认值
   * @param key 词条键名
   * @param defaultValue 默认值
   * @param params 参数对象
   */
  getSafe(key: string, defaultValue: string = '', params?: Record<string, unknown>): string {
    if (this.hasKey(key)) {
      return this.get(key, params);
    }
    return defaultValue;
  }
  
  /**
   * 批量获取词条对象
   * @param keys 词条键名数组
   */
  getMultiple(keys: string[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (const key of keys) {
      result[key] = this.get(key);
    }
    return result;
  }
  
  /**
   * 获取当前语言代码
   */
  getCurrentLang(): 'zh' | 'en' {
    return this.langSignal();
  }
  
  /**
   * 为旧模式提供兼容性访问器
   * 直接返回词条包，允许旧代码继续使用 this.dict.app.title 的形式
   */
  get dict(): typeof zh {
    return this.getLocale();
  }
  
  /**
   * 为旧模式提供兼容性访问器
   * 直接返回词条包，允许旧代码继续使用 this.i18n.app.title 的形式
   */
  get i18n(): typeof zh {
    return this.getLocale();
  }
}`;
    fs.mkdirSync(path.dirname(adapterPath), { recursive: true }); fs.writeFileSync(adapterPath, adapter, 'utf8'); info('created adapter service', { file: adapterPath })
  } else if (!hasAdapter) warn('missing adapter service', { suggest: 'create src/app/i18n/i18n-adapter.ts' })
  
  // 创建国际化服务
  if (!hasSvc && mode === 'fix') {
    const svc = `import { Injectable, signal } from '@angular/core'
import { en } from './en'
import { zh } from './zh'

@Injectable({ providedIn: 'root' })
export class I18nLocaleService {
  private langSignal = signal<'zh' | 'en'>('zh');
  
  // 响应式语言状态
  lang = this.langSignal.asReadonly();
  
  constructor() {
    // 从localStorage读取缓存
    const cachedLang = localStorage.getItem('i18n-lang');
    if (cachedLang && ['zh', 'en'].includes(cachedLang)) {
      this.langSignal.set(cachedLang as any);
    }
  }
  
  getLocale() { 
    const cached = localStorage.getItem('i18n-lang'); 
    if (cached && ['zh', 'en'].includes(cached)) this.langSignal.set(cached as any); 
    const currentLang = this.langSignal();
    return currentLang === 'en' ? en as any : zh 
  }
  
  get(key: string, params?: Record<string, unknown>) { 
    const pack: any = this.getLocale(); 
    const val = key.split('.').reduce((o,k)=>o?o[k]:undefined, pack); 
    let s = typeof val === 'string' ? val : ''; 
    if (params) { 
      for (const [k,v] of Object.entries(params)) 
        s = s.replace(new RegExp('\\\\{'+k+'\\\\}','g'), String(v)) 
    } 
    return s 
  }
  
  setLang(code: 'en'|'zh') { 
    this.langSignal.set(code); 
    localStorage.setItem('i18n-lang', code); 
    // 不再刷新页面，使用信号实现响应式更新
  }
}`
    fs.mkdirSync(path.dirname(svcPath), { recursive: true }); fs.writeFileSync(svcPath, svc, 'utf8'); info('created service', { file: svcPath })
  } else if (!hasSvc) warn('missing service', { suggest: 'create src/app/i18n/index.ts' })
  
  // 创建国际化管道
  if (!hasPipe && mode === 'fix') {
    const pipe = `import { Pipe, PipeTransform } from '@angular/core'
import { I18nLocaleService } from './index'
@Pipe({ name: 'i18n', standalone: true })
export class I18nPipe implements PipeTransform { constructor(private locale: I18nLocaleService){} transform(key: string, params?: Record<string, unknown>) { return this.locale.get(key, params) } }`
    fs.mkdirSync(path.dirname(pipePath), { recursive: true }); fs.writeFileSync(pipePath, pipe, 'utf8'); info('created pipe', { file: pipePath })
  } else if (!hasPipe) warn('missing pipe', { suggest: 'create src/app/i18n/i18n.pipe.ts' })
  
  // 检查 app.config.ts 是否配置了服务
  const appConfigPath = path.join(process.cwd(), 'src/app/app.config.ts')
  if (fs.existsSync(appConfigPath)) {
    let configContent = readFile(appConfigPath)
    if (!/I18nLocaleService/.test(configContent)) {
      if (mode === 'fix') {
        // 在providers数组中添加I18nLocaleService
        configContent = configContent.replace(
          /(providers:\s*\[\s*([^\]]*))/,
          (_match, fullMatch, existingProviders) => {
            if (existingProviders.includes('I18nLocaleService')) {
              return fullMatch // 已存在，无需添加
            }
            // 在providers数组开始后添加服务
            return `providers: [${existingProviders ? existingProviders + ',' : ''}
I18nLocaleService]`
          }
        )
        // 如果没有import I18nLocaleService，则添加import
        if (!/I18nLocaleService/.test(configContent)) {
          configContent = configContent.replace(
            /(import\s+\{[^\}]*\}\s+from\s+['"][^'"]*app\/i18n['"];)/,
            `import { I18nLocaleService } from './i18n';
$&`
          )
        }
        writeFile(appConfigPath, configContent); info('added service to app config', { file: appConfigPath })
      } else {
        warn('service not configured in app config', { file: appConfigPath })
      }
    }
  }
    
  // 检查 app.component.ts 是否导入了I18nPipe
  const appComp = path.join(process.cwd(), 'src/app/app.component.ts')
  if (fs.existsSync(appComp)) {
    let s = readFile(appComp)
    if (!/I18nPipe/.test(s)) {
      if (mode === 'fix') {
        // 找到最后一个import语句后插入import
        const lastImportMatch = s.match(/import .+?;\n(?=import|$|export)/g)
        if (lastImportMatch) {
          const lastImportIndex = s.lastIndexOf('import ')
          const eol = s.indexOf('\n', lastImportIndex)
          if (eol >= 0) {
            s = s.slice(0, eol + 1) + `import { I18nPipe } from './i18n/i18n.pipe'
` + s.slice(eol + 1)
          }
        }
        // 在imports数组中添加I18nPipe
        s = s.replace(/imports:\s*\[([^\{\]]*)\]/, (_m, inside) => {
          const imports = inside.split(',').map((imp: string) => imp.trim()).filter((imp: string) => imp)
          if (!imports.includes('I18nPipe')) {
            return `imports: [${inside} , I18nPipe]`
          }
          return _m
        })
        writeFile(appComp, s); info('imported pipe globally', { file: appComp })
      } else {
        warn('pipe not globally imported', { file: appComp })
      }
    }
  }
}