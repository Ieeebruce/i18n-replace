import { Component } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { I18nLocaleService, I18nPipe } from '../../i18n'

@Component({
  selector: 'app-user-login',
  standalone: true,
  imports: [CommonModule, FormsModule, I18nPipe],
  templateUrl: './user-login.component.html',
  styleUrl: './user-login.component.scss'
})
export class UserLoginComponent {
  dict: any
  username = ''
  password = ''
  rememberMe = false
  loading = false
  errorMessage = ''

  constructor(public i18n: I18nLocaleService) {
    
  }

  onSubmit() {
    // 验证
    if (!this.username) {
      this.errorMessage = this.i18n.get({key: 'validation.required.replace'}, { field: this.i18n.get({key: 'user.login.username'}) })
      return
    }
    
    if (!this.password) {
      this.errorMessage = this.i18n.get({key: 'validation.required.replace'}, { field: this.i18n.get({key: 'user.login.password'}) })
      return
    }

    // 模拟登录
    this.loading = true
    
    
    setTimeout(() => {
      this.loading = false
      if (this.username === 'admin' && this.password === '123456') {
        alert(this.i18n.get({key: 'user.login.loginSuccess'}))
      } else {
        
      }
    }, 1000)
  }

  forgotPassword() {
    alert(this.i18n.get({key: 'common.message.confirm'}))
  }
}
