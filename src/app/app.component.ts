import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { I18nPipe } from './i18n/i18n.pipe'

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet , I18nPipe],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
}
