import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

@Injectable({ providedIn: 'root' })
export class I18nService {
  constructor(public translate: TranslateService) {
    // 设置默认语言
    this.translate.setDefaultLang('zh');
    // 尝试从本地存储获取语言设置
    const savedLang = localStorage.getItem('language');
    if (savedLang) {
      this.translate.use(savedLang);
    } else {
      // 检测浏览器语言
      const browserLang = this.translate.getBrowserLang();
      this.translate.use(browserLang?.match(/en|zh/) ? browserLang : 'zh');
    }
  }

  // 切换语言
  setLanguage(lang: string) {
    this.translate.use(lang);
    localStorage.setItem('language', lang);
  }

  // 获取当前语言
  getCurrentLanguage(): string {
    return this.translate.currentLang;
  }

  // 翻译文本
  t(key: string, params?: any): string {
    return this.translate.instant(key, params);
  }

  // 异步翻译文本
  get(key: string, params?: any) {
    return this.translate.get(key, params);
  }
}
