import { Component } from '@angular/core'
import { CommonModule } from '@angular/common'
import { I18nLocaleService } from '../../i18n'

@Component({
  selector: 'app-alias-getter',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './alias-getter.component.html',
  styleUrl: './alias-getter.component.scss'
})
export class AliasGetterComponent {
  L = this.locale.getLocale();
  title: string;
  constructor(public locale: I18nLocaleService) {
    this.title = this.L.home.welcome
  }
}