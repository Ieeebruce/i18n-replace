import { Component } from '@angular/core'
import { CommonModule } from '@angular/common'
import { I18nLocaleService, I18nPipe } from '../../i18n'

@Component({
  selector: 'app-alias-getter',
  standalone: true,
  imports: [CommonModule, I18nPipe],
  templateUrl: './alias-getter.component.html',
  styleUrl: './alias-getter.component.scss'
})
export class AliasGetterComponent {
  
  title: string;
  constructor(public locale: I18nLocaleService) {
    
  }
}