import { Component } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { I18nLocaleService } from '../../i18n'

interface User {
  id: number
  name: string
  email: string
  phone: string
  status: 'active' | 'inactive'
  createTime: string
}

@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './data-table.component.html',
  styleUrl: './data-table.component.scss'
})
export class DataTableComponent {
  i18n: any
  users: User[] = []
  filteredUsers: User[] = []
  searchKeyword = ''
  currentFilter: 'all' | 'active' | 'inactive' = 'all'
  sortColumn: keyof User = 'id'
  sortOrder: 'asc' | 'desc' = 'asc'
  
  // 分页
  currentPage = 1
  pageSize = 5
  totalItems = 0

  constructor(private locale: I18nLocaleService) {
    this.i18n = this.locale.getLocale()
    this.initData()
  }

  initData() {
    // 模拟数据
    this.users = [
      { id: 1, name: '张三', email: 'zhangsan@example.com', phone: '13800138001', status: 'active', createTime: '2024-01-15' },
      { id: 2, name: '李四', email: 'lisi@example.com', phone: '13800138002', status: 'active', createTime: '2024-01-16' },
      { id: 3, name: '王五', email: 'wangwu@example.com', phone: '13800138003', status: 'inactive', createTime: '2024-01-17' },
      { id: 4, name: 'Alice', email: 'alice@example.com', phone: '13800138004', status: 'active', createTime: '2024-01-18' },
      { id: 5, name: 'Bob', email: 'bob@example.com', phone: '13800138005', status: 'inactive', createTime: '2024-01-19' },
      { id: 6, name: 'Charlie', email: 'charlie@example.com', phone: '13800138006', status: 'active', createTime: '2024-01-20' },
      { id: 7, name: 'David', email: 'david@example.com', phone: '13800138007', status: 'active', createTime: '2024-01-21' },
      { id: 8, name: 'Eva', email: 'eva@example.com', phone: '13800138008', status: 'inactive', createTime: '2024-01-22' },
    ]
    this.applyFilters()
  }

  applyFilters() {
    let result = [...this.users]
    
    // 应用状态过滤
    if (this.currentFilter !== 'all') {
      result = result.filter(u => u.status === this.currentFilter)
    }
    
    // 应用搜索
    if (this.searchKeyword) {
      const keyword = this.searchKeyword.toLowerCase()
      result = result.filter(u => 
        u.name.toLowerCase().includes(keyword) ||
        u.email.toLowerCase().includes(keyword) ||
        u.phone.includes(keyword)
      )
    }
    
    // 应用排序
    result.sort((a, b) => {
      const aVal = a[this.sortColumn]
      const bVal = b[this.sortColumn]
      const comparison = aVal > bVal ? 1 : aVal < bVal ? -1 : 0
      return this.sortOrder === 'asc' ? comparison : -comparison
    })
    
    this.totalItems = result.length
    this.filteredUsers = result
  }

  getPaginatedUsers(): User[] {
    const start = (this.currentPage - 1) * this.pageSize
    const end = start + this.pageSize
    return this.filteredUsers.slice(start, end)
  }

  setFilter(filter: 'all' | 'active' | 'inactive') {
    this.currentFilter = filter
    this.currentPage = 1
    this.applyFilters()
  }

  search() {
    this.currentPage = 1
    this.applyFilters()
  }

  sort(column: keyof User) {
    if (this.sortColumn === column) {
      this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc'
    } else {
      this.sortColumn = column
      this.sortOrder = 'asc'
    }
    this.applyFilters()
  }

  viewUser(user: User) {
    alert(this.i18n.table.actions.view + ': ' + user.name)
  }

  editUser(user: User) {
    alert(this.i18n.table.actions.edit + ': ' + user.name)
  }

  deleteUser(user: User) {
    const confirmMsg = this.i18n.notification.warning.deleteConfirm.replace('{item}', user.name)
    if (confirm(confirmMsg)) {
      this.users = this.users.filter(u => u.id !== user.id)
      this.applyFilters()
      alert(this.i18n.notification.success.deleted.replace('{item}', user.name))
    }
  }

  refresh() {
    this.searchKeyword = ''
    this.currentFilter = 'all'
    this.currentPage = 1
    this.initData()
    alert(this.i18n.notification.success.saved)
  }

  getTotalPages(): number {
    return Math.ceil(this.totalItems / this.pageSize)
  }

  goToPage(page: number) {
    if (page >= 1 && page <= this.getTotalPages()) {
      this.currentPage = page
    }
  }
}
