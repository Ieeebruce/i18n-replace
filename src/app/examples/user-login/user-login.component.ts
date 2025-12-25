import { Component } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { I18nLocaleService } from '../../i18n'

@Component({
  selector: 'app-user-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
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

  constructor(private locale: I18nLocaleService) {
    this.dict = this.locale.getLocale()
  }

  onSubmit() {
    // 验证
    if (!this.username) {
      this.errorMessage = this.dict.validation.required.replace('{field}', this.dict.user.login.username)
      return
    }
    
    if (!this.password) {
      this.errorMessage = this.dict.validation.required.replace('{field}', this.dict.user.login.password)
      return
    }

    // 模拟登录
    this.loading = true
    this.errorMessage = ''
    
    setTimeout(() => {
      this.loading = false
      if (this.username === 'admin' && this.password === '123456') {
        alert(this.dict.user.login.loginSuccess)
      } else {
        this.errorMessage = this.dict.user.login.loginFailed
      }
    }, 1000)
  }

  forgotPassword() {
    alert(this.dict.common.message.confirm)
  }
}
