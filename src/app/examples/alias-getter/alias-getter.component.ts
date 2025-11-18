import { Component } from '@angular/core'
import { CommonModule } from '@angular/common'
import { T as I18nT, replace } from '../../i18n'

@Component({
  selector: 'app-alias-getter',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './alias-getter.component.html',
  styleUrl: './alias-getter.component.scss'
})
export class AliasGetterComponent {
  get L() { return I18nT }
  replace(s: string, params: Record<string, string | number>) { return replace(s, params) }
}