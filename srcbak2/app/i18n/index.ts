import { Injectable } from '@angular/core';
import { en } from './en';
import { zh } from './zh';
export type ZH = typeof zh;
@Injectable({ providedIn: 'root' })
export class I18nLocaleService {
  lang: 'zh' | 'en' = 'zh';
  getLocale(): typeof zh {
    // 从localStorage读取缓存
    const cachedLang = localStorage.getItem('i18n-lang');
    if (cachedLang) {
      this.lang = cachedLang as 'zh' | 'en';
    }
    return this.lang === 'en' ? en as any : zh;
  }
  get(key: string, params?: Record<string, unknown>) {
    const pack = this.getLocale() as any;
    const val = key.split('.').reduce((o, k) => (o ? o[k] : undefined), pack);
    let s = typeof val === 'string' ? val : '';
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return s;
  }
  setLang(code: 'en' | 'zh') {
    this.lang = code;
    // 缓存到localStorage
    localStorage.setItem('i18n-lang', code);
    window.location.reload();
  }
}
