import { Injectable } from '@angular/core';
import { I18nLocaleService } from '../i18n';

@Injectable({
  providedIn: 'root',
})
export class ExampleService {
  i18n: any;
  constructor(private locale: I18nLocaleService) {
    this.i18n = this.locale.getLocale().app;
  }
}
