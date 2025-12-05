import { Component } from '@angular/core'
import { CommonModule } from '@angular/common'
import { I18nLocaleService } from '../../i18n'
import { I18nPipe } from '../../i18n/i18n.pipe';

@Component({
  selector: 'app-alias-getter',
  standalone: true,
  imports: [CommonModule, I18nPipe],
  templateUrl: './alias-getter.component.html',
  styleUrl: './alias-getter.component.scss'
})
export class AliasGetterComponent {
  title: string;
  constructor(public i18n: I18nLocaleService) {
    this.title = this.i18n.get('home.welcome')
  }
}