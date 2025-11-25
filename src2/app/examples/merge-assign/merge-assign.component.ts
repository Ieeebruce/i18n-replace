import { Component } from '@angular/core'
import { CommonModule } from '@angular/common'
import { I18nLocaleService } from '../../i18n'

@Component({
  selector: 'app-merge-assign',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './merge-assign.component.html',
  styleUrl: './merge-assign.component.scss'
})
export class MergeAssignComponent {
  dict;
  constructor(public locale: I18nLocaleService) {
    this.dict = this.locale.getLocale();
  }

}