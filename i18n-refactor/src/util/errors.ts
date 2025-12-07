export class ParseError extends Error {
  file?: string
  constructor(message: string, file?: string) { super(message); this.name = 'ParseError'; this.file = file }
}

export class IOError extends Error {
  file?: string
  constructor(message: string, file?: string) { super(message); this.name = 'IOError'; this.file = file }
}

export class ValidationError extends Error {
  detail?: any
  constructor(message: string, detail?: any) { super(message); this.name = 'ValidationError'; this.detail = detail }
}

export class ConfigError extends Error {
  constructor(message: string) { super(message); this.name = 'ConfigError' }
}

