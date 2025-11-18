import { Component } from '@angular/core'
import { CommonModule } from '@angular/common'
import { I18nService } from '../../i18n/service'
import { assignMerge, replace } from '../../i18n'

@Component({
  selector: 'app-service-di',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './service-di.component.html',
  styleUrl: './service-di.component.scss'
})
export class ServiceDiComponent {
  constructor(public i18n: I18nService) {}

  get dict() {
    return this.i18n.lang === 'zh'
      ? assignMerge(this.i18n.zhA, this.i18n.zhB, this.i18n.zhC)
      : assignMerge(this.i18n.enA, this.i18n.enB, this.i18n.enC)
  }

  switch(lang: 'zh' | 'en') { this.i18n.setLang(lang) }
  replace(s: string, params: Record<string, string | number>) { return replace(s, params) }
}