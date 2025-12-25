export const en = {
  app: {
    title: 'Angular i18n (TS objects) demo',
    description: 'Translations are defined in TypeScript and referenced via objects.',
    switchToEn: 'Switch to English',
    switchToZh: '切换到中文',
    footer: 'Footer',
    header: 'App header override',
    onlyApp: 'Only in app',
    common: { desc: 'App overrides common description' },
    shared: { label: 'App label override' },
    settings: { theme: 'App theme' },
    user: { greetTpl: 'App hi, {name}!'},
    app: { desc: 'App description' }
  },
  common: {
    common: { title: 'Common title', desc: 'Common description' },
    header: 'Common header',
    footer: 'Common footer',
    onlyCommon: 'Only in common',
    shared: { label: 'Common label' },
    settings: { theme: 'Default theme' },
    user: { greetTpl: 'Hi, {name}!'},
    button: {
      confirm: 'Confirm',
      cancel: 'Cancel',
      save: 'Save',
      delete: 'Delete',
      edit: 'Edit',
      add: 'Add',
      search: 'Search',
      reset: 'Reset',
      submit: 'Submit',
      close: 'Close'
    },
    message: {
      loading: 'Loading...',
      noData: 'No data available',
      success: 'Operation successful',
      error: 'Operation failed',
      confirm: 'Are you sure you want to proceed?'
    },
    pagination: {
      total: 'Total {total} items',
      pageSize: '{size} items per page',
      goto: 'Go to',
      page: 'Page'
    }
  },
  home: {
    welcome: 'Welcome!'
  },
  list: {
    items: ['Item A', 'Item B', 'Item C']
  },
  templates: {
    info: 'Hello, {name}. You have {count} notifications.',
    itemTpl: 'Index {index}: {value}'
  },
  user: {
    greetTpl: 'Hi, {name}!',
    login: {
      title: 'User Login',
      username: 'Username',
      password: 'Password',
      remember: 'Remember me',
      forgotPassword: 'Forgot password?',
      noAccount: "Don't have an account?",
      signUp: 'Sign up now',
      loginBtn: 'Login',
      loginSuccess: 'Login successful, welcome back!',
      loginFailed: 'Login failed, please check your credentials'
    },
    register: {
      title: 'User Registration',
      email: 'Email',
      confirmPassword: 'Confirm Password',
      agreement: 'I have read and agree to',
      terms: 'Terms of Service',
      registerBtn: 'Register',
      hasAccount: 'Already have an account?',
      goLogin: 'Go to login',
      registerSuccess: 'Registration successful!',
      registerFailed: 'Registration failed, please try again'
    },
    profile: {
      title: 'User Profile',
      nickname: 'Nickname',
      avatar: 'Avatar',
      phone: 'Phone Number',
      gender: 'Gender',
      male: 'Male',
      female: 'Female',
      birthday: 'Birthday',
      bio: 'Bio',
      updateSuccess: 'Update successful',
      updateFailed: 'Update failed'
    }
  },
  validation: {
    required: '{field} is required',
    email: 'Please enter a valid email address',
    minLength: '{field} must be at least {min} characters',
    maxLength: '{field} cannot exceed {max} characters',
    pattern: '{field} format is incorrect',
    passwordMismatch: 'Passwords do not match',
    numberOnly: '{field} must contain only numbers',
    phoneFormat: 'Please enter a valid phone number',
    urlFormat: 'Please enter a valid URL',
    range: '{field} must be between {min} and {max}'
  },
  table: {
    columns: {
      id: 'ID',
      name: 'Name',
      email: 'Email',
      phone: 'Phone',
      status: 'Status',
      createTime: 'Created At',
      updateTime: 'Updated At',
      actions: 'Actions'
    },
    actions: {
      view: 'View',
      edit: 'Edit',
      delete: 'Delete',
      export: 'Export',
      import: 'Import',
      refresh: 'Refresh'
    },
    filter: {
      all: 'All',
      active: 'Active',
      inactive: 'Inactive',
      placeholder: 'Search by keyword'
    },
    sort: {
      asc: 'Ascending',
      desc: 'Descending'
    }
  },
  notification: {
    success: {
      created: '{item} created successfully',
      updated: '{item} updated successfully',
      deleted: '{item} deleted successfully',
      saved: 'Saved successfully'
    },
    error: {
      created: 'Failed to create {item}',
      updated: 'Failed to update {item}',
      deleted: 'Failed to delete {item}',
      saved: 'Failed to save',
      network: 'Network error, please try again',
      permission: 'You do not have permission to perform this action',
      timeout: 'Request timeout, please try again'
    },
    warning: {
      unsaved: 'You have unsaved changes',
      deleteConfirm: 'Are you sure you want to delete {item}? This action cannot be undone',
      leaving: 'Are you sure you want to leave? Unsaved changes will be lost'
    },
    info: {
      processing: 'Processing...',
      uploaded: '{count} file(s) uploaded',
      selected: '{count} item(s) selected'
    }
  },
  upload: {
    title: 'File Upload',
    dragTip: 'Drag files here, or',
    clickUpload: 'Click to upload',
    fileLimit: 'Only {types} files are allowed',
    sizeLimit: 'File size cannot exceed {size}MB',
    uploading: 'Uploading...',
    uploadSuccess: 'Upload successful',
    uploadFailed: 'Upload failed',
    preview: 'Preview',
    download: 'Download',
    remove: 'Remove',
    maxFiles: 'Maximum {max} files allowed'
  },
  permission: {
    role: {
      admin: 'Administrator',
      user: 'User',
      guest: 'Guest'
    },
    denied: 'Permission denied',
    loginRequired: 'Please login first',
    upgrade: 'Upgrade your account to use this feature'
  }
} as const
