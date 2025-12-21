import { Component } from '@angular/core'
import { CommonModule } from '@angular/common'
import { I18nLocaleService } from '../../i18n'
import { ExampleService } from '../../shared/common.service';

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
  info: string;
  i18n: any;
  constructor(public locale: I18nLocaleService, private exampleService: ExampleService) {
    this.title = this.L.home.welcome
    this.info = this.L.templates.info.replace('{name}', '李四').replace('{count}', '2');
    this.i18n = this.exampleService.i18n;
    this.title = this.i18n.title;
  }
}