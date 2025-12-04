import { Component } from '@angular/core';
import { I18nLocaleService } from '../../i18n';

@Component({ selector: 'app-test', template: '' })
export class TestComponent {
  i18n: any;
  dict: any;
  title: string;
  header: string;
  onlyC: string;
  i18nCommon: any;
  sss: string;
  xxxxx: any;

  constructor(private locale: I18nLocaleService) {
    this.i18n = this.locale.getLocale();
    this.dict = {
      ...this.locale.getLocale().common,
      ...this.locale.getLocale().app,
    };
    this.i18nCommon = this.i18n.common;
  }

  ngOnInit() {
    this.title = this.i18n.app.title;
    this.header = this.dict.header;
    this.onlyC = this.dict.onlyCommon;
    this.sss = 'test';
  }
  xx() {
    this.xxxxx = this.i18n.common.onlyCommon;
  }
}
