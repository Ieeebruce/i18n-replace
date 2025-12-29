"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.i18nServiceTemplate = void 0;
// i18n服务内容模板
exports.i18nServiceTemplate = `import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

@Injectable({
  providedIn: 'root'
})
export class I18nLocaleService {
  constructor(private translate: TranslateService) {}
  
  getLocale() {
    return this.translate;
  }
}
`;
