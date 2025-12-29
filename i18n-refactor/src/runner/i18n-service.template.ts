// i18n服务内容模板
export const i18nServiceTemplate = `import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

@Injectable({
  providedIn: 'root'
})
export class I18nLocaleService {
  constructor(private translate: TranslateService) {}
  
  get(key: string, params?: any) {
    return this.translate.get(key, params);
  }
}
`;