import { Component } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { I18nLocaleService } from './i18n';
import { I18nPipe } from './i18n/i18n.pipe'

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, RouterLink , I18nPipe],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  i18n :any
  constructor(private local: I18nLocaleService) {
    this.i18n = this.local.getLocale()
  }
}
