import { Injectable } from '@angular/core';
import { en } from './en';
import { zh } from './zh';

export type ZH = typeof zh;

@Injectable({ providedIn: 'root' })
export class I18nLocaleService {
  lang: 'zh' | 'en' = 'zh';

  constructor() {
    const cachedLang = localStorage.getItem('i18n-lang');
    if (cachedLang) {
      this.lang = cachedLang as 'zh' | 'en';
    }
  }

  getLocale(): typeof zh {
    return this.lang === 'en' ? en as any : zh;
  }

  get(key: string, params?: Record<string, unknown>): string {
    const pack = this.getLocale() as any;
    let s = pack[key] || key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return s;
  }

  setLang(code: 'en' | 'zh') {
    this.lang = code;
    localStorage.setItem('i18n-lang', code);
    window.location.reload();
  }
}
