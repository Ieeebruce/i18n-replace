import { Injectable } from '@angular/core';
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
