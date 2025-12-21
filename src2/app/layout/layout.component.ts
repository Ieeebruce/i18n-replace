import { Component } from '@angular/core'
import { CommonModule } from '@angular/common'
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router'
import { I18nPipe } from '../i18n/i18n.pipe'
import { I18nLocaleService } from '../i18n'

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, I18nPipe],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss'
})
export class LayoutComponent {
  constructor(public locale: I18nLocaleService) {}
  switch(lang: 'en' | 'zh') { this.locale.setLang(lang) }
}

