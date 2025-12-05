import { Component } from '@angular/core'
import { CommonModule } from '@angular/common'
import { I18nLocaleService, ZH } from '../../i18n'
import { I18nPipe } from '../../i18n/i18n.pipe';

@Component({
  selector: 'app-merge-assign',
  standalone: true,
  imports: [CommonModule, I18nPipe],
  templateUrl: './merge-assign.component.html',
  styleUrl: './merge-assign.component.scss'
})
export class MergeAssignComponent {
  title: string;
  title2: string;
  header: string;
  footer: string;
  onlyCommon: string;
  onlyApp: string;
  greet: string;
  constructor(public i18n: I18nLocaleService) {
  }

  xx() {
    this.title = this.i18n.get('app.description')
    this.title2 = this.i18n.get('home.welcome')
    this.header = this.i18n.get('app.header')
    this.footer = this.i18n.get('app.footer')
    this.onlyCommon = this.i18n.get('common.onlyCommon')
    this.onlyApp = this.i18n.get('app.onlyApp')
    this.greet = this.i18n.get('app.user.greetTpl', {name:'李雷'})
  }
}
