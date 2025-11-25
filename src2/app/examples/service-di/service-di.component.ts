import { I18nPipe } from '../../i18n/i18n.pipe'
import { Component } from '@angular/core'
import { CommonModule } from '@angular/common'
import { I18nLocaleService } from '../../i18n'

@Component({
  selector: 'app-service-di',
  standalone: true,
  imports: [CommonModule, I18nPipe],
  templateUrl: './service-di.component.html',
  styleUrl: './service-di.component.scss'
})
export class ServiceDiComponent {
  i18n;
  constructor(public locale: I18nLocaleService) {
    this.i18n = this.locale.getLocale();
  }

}