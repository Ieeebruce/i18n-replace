import { Component } from '@angular/core';
import { I18nService } from './i18n';

@Component({
  selector: 'app-dynamic-test',
  template: `<div>Test</div>`,
  standalone: true
})
export class DynamicTestComponent {
  locale: any;
  
  constructor(private i18nService: I18nService) {
    this.locale = this.i18nService.getLocale('zh');
  }

  ngOnInit() {
    // 这应该被检测为动态 key
    const key = 'title';
    const value1 = this.locale.app[key];
    
    // 另一个动态访问
    const idx = 0;
    const value2 = this.locale.home.items[idx];
  }
}
