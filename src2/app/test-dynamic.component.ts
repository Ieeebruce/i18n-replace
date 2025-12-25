import { Component } from '@angular/core';
import { I18nService } from './i18n';

@Component({
  selector: 'app-test-dynamic',
  template: `<div>Test</div>`,
  standalone: true
})
export class TestDynamicComponent {
  i18n: any;
  idx = 1;
  
  constructor(private locale: I18nService) {
    this.i18n = this.locale.getLocale();
  }

  run() {
    // 这应该被检测为动态 key
    console.log(this.i18n.list[this.idx]);
  }
}
