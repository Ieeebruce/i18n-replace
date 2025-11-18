import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { T as I18nT, setLang, replace } from './i18n';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = ''
  get T() {
    return I18nT;
  }

  switch(lang: 'en' | 'zh') {
    const ov = this.useOverride
      ? [lang === 'en' ? this.overrideEn : this.overrideZh]
      : []
    setLang(lang, ...ov);
  }

  useOverride = true
  overrideEn = {
    home: { welcome: 'Welcome (overridden)!' },
    list: { items: ['Item A', 'Item B', 'Item B (override)', 'Item D'] }
  }
  overrideZh = {
    home: { welcome: '欢迎（覆盖）！' },
    list: { items: ['项目一', '项目二（覆盖）', '项目三'] }
  }

  toggleOverride() {
    this.useOverride = !this.useOverride
  }

  replace(s: string, params: Record<string, string | number>) {
    return replace(s, params)
  }

  constructor() {
    this.switch('zh')
  }
}
