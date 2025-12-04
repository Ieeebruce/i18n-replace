import { Component } from '@angular/core';
import { I18nLocaleService } from '../../i18n';

@Component({ selector: 'app-test', template: '' })
export class TestComponent {
  title: string;
  header: string;
  onlyC: string;
  sss: string;
  xxxxx: any;

  constructor(public i18n: I18nLocaleService) {
  }

  ngOnInit() {
    this.title = this.i18n.get('app.title');
    this.header = this.i18n.get('app.header');
    this.onlyC = this.i18n.get('common.onlyCommon');
    this.sss = 'test';
  }
  xx() {
    this.xxxxx = this.i18n.get('common.onlyCommon');
  }
}
