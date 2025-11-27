import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { I18nLocaleService, ZH } from './i18n';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = ''
  i18n: ZH;
  local;
  constructor(public locale: I18nLocaleService) {
    this.local = this.locale.getLocale();
    this.i18n = {...this.local}
    this.title = this.i18n.app.title;
  }

  switch(lang: 'en' | 'zh') {
    this.locale.setLang(lang)
  }

}
