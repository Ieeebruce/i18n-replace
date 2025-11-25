import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { I18nLocaleService } from './i18n';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = ''
  i18n;
  local: { app: { title: string; description: string; switchToEn: string; switchToZh: string; }; home: { welcome: string; }; list: { items: string[]; }; templates: { info: string; itemTpl: string; }; user: { greetTpl: string; }; };
  constructor(public locale: I18nLocaleService) {
    this.local = this.locale.getLocale();
    this.i18n = {...this.local.home, ...this.local.app}
    this.title = this.i18n.title;
  }

  switch(lang: 'en' | 'zh') {
    this.locale.setLang(lang)
  }

}
