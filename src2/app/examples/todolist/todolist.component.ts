import { Component } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { I18nLocaleService } from '../../i18n';

type TodoItem = { id: number; text: string; done: boolean }

@Component({
  selector: 'app-todolist',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './todolist.component.html',
  styleUrl: './todolist.component.scss'
})
export class TodolistComponent {
  i18n: any
  items: TodoItem[] = []
  input = ''
  filter: 'all' | 'active' | 'completed' = 'all'
  nextId = 1
  title: any;
constructor(private locale: I18nLocaleService) {
  this.i18n = this.locale.getLocale();
  this.title = this.i18n.app.title
}
  ngOnInit() {
    const s = localStorage.getItem('todo.items')
    if (s) {
      const arr = JSON.parse(s) as TodoItem[]
      this.items = arr.map(x => ({ id: x.id, text: x.text, done: !!x.done }))
      this.nextId = this.items.reduce((m, it) => Math.max(m, it.id), 0) + 1
    }
  }

  add() {
    const t = this.input.trim()
    if (!t) return
    this.items = [...this.items, { id: this.nextId++, text: t, done: false }]
    this.input = ''
    this.persist()
  }

  toggle(id: number) {
    this.items = this.items.map(it => it.id === id ? { ...it, done: !it.done } : it)
    this.persist()
  }

  remove(id: number) {
    this.items = this.items.filter(it => it.id !== id)
    this.persist()
  }

  clearCompleted() {
    this.items = this.items.filter(it => !it.done)
    this.persist()
  }

  setFilter(f: 'all' | 'active' | 'completed') { this.filter = f }

  visible(): TodoItem[] {
    if (this.filter === 'active') return this.items.filter(it => !it.done)
    if (this.filter === 'completed') return this.items.filter(it => it.done)
    return this.items
  }

  leftCount(): number { return this.items.filter(it => !it.done).length }

  persist() { localStorage.setItem('todo.items', JSON.stringify(this.items)) }
}

