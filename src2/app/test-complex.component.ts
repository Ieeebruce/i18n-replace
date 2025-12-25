import { Component } from '@angular/core';
import { I18nService } from '../i18n';

@Component({
  selector: 'app-test-complex',
  template: `<div>Test</div>`,
  standalone: true
})
export class TestComplexComponent {
  constructor(private i18nService: I18nService) {}

  ngOnInit() {
    const locale = this.i18nService.getLocale('zh');
    
    // 动态 key 的情况
    const dynamicKey = 'title';
    const value1 = locale.app[dynamicKey];
    
    // 另一个动态情况
    const index = 0;
    const value2 = locale.home.items[index];
    
    // 嵌套动态访问
    const category = 'welcome';
    const value3 = locale.home[category].message;
  }
}
