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
  constructor(public locale: I18nLocaleService) {
    this.i18n = this.locale.getLocale();
    this.title = this.i18n.title;
  }

  switch(lang: 'en' | 'zh') {
    this.locale.setLang(lang)
  }

}
