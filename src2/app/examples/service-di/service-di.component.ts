import { Component } from '@angular/core'
import { CommonModule } from '@angular/common'
import { I18nLocaleService, ZH } from '../../i18n'

@Component({
  selector: 'app-service-di',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './service-di.component.html',
  styleUrl: './service-di.component.scss'
})
export class ServiceDiComponent {
  i18n: ZH['app'];
  constructor(public locale: I18nLocaleService) {
    const local = this.locale.getLocale().app
    this.i18n = local;
  }

}