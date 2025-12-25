export const zh = {
  app: {
    title: 'Angular 国际化（TS对象）示例',
    description: '词条采用 TypeScript 定义，使用处为对象引用。',
    switchToEn: '切换到英文',
    switchToZh: '切换到中文',
    footer: '页脚',
    header: '应用头部覆盖',
    onlyApp: '仅应用',
    common: { desc: '应用覆盖的通用描述' },
    shared: { label: '应用标签覆盖' },
    settings: { theme: '应用主题' },
    user: { greetTpl: '应用你好，{name}!' },
    app: { desc: '应用描述' }
  },
  common: {
    common: { title: '通用标题', desc: '通用描述' },
    header: '通用头部',
    footer: '通用页脚',
    onlyCommon: '仅通用',
    shared: { label: '通用标签' },
    settings: { theme: '默认主题' },
    user: { greetTpl: '你好，{name}!'},
    button: {
      confirm: '确认',
      cancel: '取消',
      save: '保存',
      delete: '删除',
      edit: '编辑',
      add: '添加',
      search: '搜索',
      reset: '重置',
      submit: '提交',
      close: '关闭'
    },
    message: {
      loading: '加载中...',
      noData: '暂无数据',
      success: '操作成功',
      error: '操作失败',
      confirm: '确认要执行此操作吗？'
    },
    pagination: {
      total: '共 {total} 条',
      pageSize: '每页 {size} 条',
      goto: '跳至',
      page: '页'
    }
  },
  home: {
    welcome: '欢迎！',
    title: '首页'
  },
  list: {
    items: ['项目一', '项目二', '项目三']
  },
  templates: {
    info: '你好，{name}。你有 {count} 条通知。',
    itemTpl: '索引 {index}：{value}'
  },
  user: {
    greetTpl: '你好，{name}!',
    login: {
      title: '用户登录',
      username: '用户名',
      password: '密码',
      remember: '记住我',
      forgotPassword: '忘记密码？',
      noAccount: '还没有账号？',
      signUp: '立即注册',
      loginBtn: '登录',
      loginSuccess: '登录成功，欢迎回来！',
      loginFailed: '登录失败，请检查用户名和密码'
    },
    register: {
      title: '用户注册',
      email: '邮箱',
      confirmPassword: '确认密码',
      agreement: '我已阅读并同意',
      terms: '服务条款',
      registerBtn: '注册',
      hasAccount: '已有账号？',
      goLogin: '去登录',
      registerSuccess: '注册成功！',
      registerFailed: '注册失败，请稍后重试'
    },
    profile: {
      title: '个人资料',
      nickname: '昵称',
      avatar: '头像',
      phone: '手机号',
      gender: '性别',
      male: '男',
      female: '女',
      birthday: '生日',
      bio: '个人简介',
      updateSuccess: '更新成功',
      updateFailed: '更新失败'
    }
  },
  validation: {
    required: '{field}不能为空',
    email: '请输入有效的邮箱地址',
    minLength: '{field}至少需要{min}个字符',
    maxLength: '{field}不能超过{max}个字符',
    pattern: '{field}格式不正确',
    passwordMismatch: '两次输入的密码不一致',
    numberOnly: '{field}只能包含数字',
    phoneFormat: '请输入有效的手机号',
    urlFormat: '请输入有效的URL地址',
    range: '{field}必须在{min}到{max}之间'
  },
  table: {
    columns: {
      id: 'ID',
      name: '姓名',
      email: '邮箱',
      phone: '电话',
      status: '状态',
      createTime: '创建时间',
      updateTime: '更新时间',
      actions: '操作'
    },
    actions: {
      view: '查看',
      edit: '编辑',
      delete: '删除',
      export: '导出',
      import: '导入',
      refresh: '刷新'
    },
    filter: {
      all: '全部',
      active: '激活',
      inactive: '未激活',
      placeholder: '请输入关键词搜索'
    },
    sort: {
      asc: '升序',
      desc: '降序'
    }
  },
  notification: {
    success: {
      created: '{item}创建成功',
      updated: '{item}更新成功',
      deleted: '{item}删除成功',
      saved: '保存成功'
    },
    error: {
      created: '{item}创建失败',
      updated: '{item}更新失败',
      deleted: '{item}删除失败',
      saved: '保存失败',
      network: '网络错误，请稍后重试',
      permission: '您没有权限执行此操作',
      timeout: '请求超时，请重试'
    },
    warning: {
      unsaved: '您有未保存的更改',
      deleteConfirm: '确定要删除{item}吗？此操作不可撤销',
      leaving: '确定要离开吗？未保存的更改将丢失'
    },
    info: {
      processing: '正在处理...',
      uploaded: '已上传{count}个文件',
      selected: '已选择{count}项'
    }
  },
  upload: {
    title: '文件上传',
    dragTip: '将文件拖到此处，或',
    clickUpload: '点击上传',
    fileLimit: '只能上传{types}文件',
    sizeLimit: '文件大小不能超过{size}MB',
    uploading: '上传中...',
    uploadSuccess: '上传成功',
    uploadFailed: '上传失败',
    preview: '预览',
    download: '下载',
    remove: '移除',
    maxFiles: '最多只能上传{max}个文件'
  },
  permission: {
    role: {
      admin: '管理员',
      user: '普通用户',
      guest: '访客'
    },
    denied: '权限不足',
    loginRequired: '请先登录',
    upgrade: '升级账号以使用此功能'
  }
} as const
