import { Injectable } from '@angular/core';
import { en } from './en';
import { zh } from './zh';

@Injectable({ providedIn: 'root' })
export class I18nLocaleService {
  lang: 'zh' | 'en' = 'zh';
  getLocale() {
    // 从localStorage读取缓存
    const cachedLang = localStorage.getItem('i18n-lang');
    if (cachedLang) {
      this.lang = cachedLang as 'zh' | 'en';
    }
    return this.lang === 'en' ? en : zh;
  }
  setLang(code: 'en' | 'zh') {
    this.lang = code;
    // 缓存到localStorage
    localStorage.setItem('i18n-lang', code);
    window.location.reload();
  }
}
