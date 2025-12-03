import { Component } from '@angular/core'
import { CommonModule } from '@angular/common'
import { I18nLocaleService, ZH } from '../../i18n'

@Component({
  selector: 'app-merge-assign',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './merge-assign.component.html',
  styleUrl: './merge-assign.component.scss'
})
export class MergeAssignComponent {
  dict: ZH;
  title: string;
  i18n: { welcome: "欢迎！"; title: "首页"; description: "词条采用 TypeScript 定义，使用处为对象引用。"; switchToEn: "切换到英文"; switchToZh: "切换到中文"; };
  title2: string;
  constructor(public locale: I18nLocaleService) {
    this.dict = this.locale.getLocale();
    this.i18n = {...this.locale.getLocale().app, ...this.locale.getLocale().home}
  }

  xx() {
    this.title = this.dict.app.description
    this.title2 = this.i18n.welcome
  }

}