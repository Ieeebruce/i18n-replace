import { Component } from '@angular/core'
import { CommonModule } from '@angular/common'
import { zhA, zhB, zhC, enA, enB, enC, assignMerge, replace } from '../../i18n'

@Component({
  selector: 'app-merge-assign',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './merge-assign.component.html',
  styleUrl: './merge-assign.component.scss'
})
export class MergeAssignComponent {
  lang: 'zh' | 'en' = 'zh'

  get dict() {
    return this.lang === 'zh' ? assignMerge(zhA, zhB, zhC) : assignMerge(enA, enB, enC)
  }

  switch(lang: 'zh' | 'en') { this.lang = lang }

  replace(s: string, params: Record<string, string | number>) { return replace(s, params) }
}