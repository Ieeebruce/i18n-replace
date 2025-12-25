import { Component } from '@angular/core';
import { I18nService } from './i18n';

@Component({
  selector: 'app-dynamic-keys',
  template: `<div>Test Dynamic Keys</div>`,
  standalone: true
})
export class DynamicKeysComponent {
  i18n: any;
  
  constructor(private locale: I18nService) {
    this.i18n = this.locale.getLocal();
  }

  ngOnInit() {
    // 动态 key 访问 - 这应该被检测为 complex case
    const dynamicKey = 'title';
    const value1 = this.i18n.app[dynamicKey];
    
    // 另一个动态访问
    const index = 0;
    const value2 = this.i18n.home.items[index];
    
    // 嵌套动态访问
    const category = 'welcome';
    const value3 = this.i18n.home[category];
  }
}
