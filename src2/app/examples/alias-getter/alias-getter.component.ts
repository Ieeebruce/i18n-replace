import { I18nPipe } from '../../i18n/i18n.pipe'
import { Component } from '@angular/core'
import { CommonModule } from '@angular/common'
import { I18nLocaleService } from '../../i18n'

@Component({
  selector: 'app-alias-getter',
  standalone: true,
  imports: [CommonModule, I18nPipe],
  templateUrl: './alias-getter.component.html',
  styleUrl: './alias-getter.component.scss'
})
export class AliasGetterComponent {
  L;
  constructor(public locale: I18nLocaleService) {
    this.L = this.locale.getLocale();
  }
}