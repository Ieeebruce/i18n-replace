import { Component } from '@angular/core'
import { CommonModule } from '@angular/common'
import { I18nLocaleService, ZH } from '../../i18n'
import { I18nPipe } from '../../i18n/i18n.pipe';

@Component({
  selector: 'app-service-di',
  standalone: true,
  imports: [CommonModule, I18nPipe],
  templateUrl: './service-di.component.html',
  styleUrl: './service-di.component.scss'
})
export class ServiceDiComponent {
  constructor(public i18n: I18nLocaleService) {
  }

}