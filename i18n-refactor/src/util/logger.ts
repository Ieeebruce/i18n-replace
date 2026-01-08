type Level = 'debug' | 'info' | 'warn' | 'error'
type Format = 'json' | 'pretty' | 'html'

interface LoggerOptions {
  level?: Level;
  format?: Format;
  output?: 'stderr' | 'stdout' | string; // string for file path
  timestamp?: boolean;
}

interface LogContext {
  [key: string]: any;
  error?: Error;
  stack?: string;
  file?: string;
  line?: number;
  column?: number;
}

let currentLevel: Level = 'info'
let currentFormat: Format = 'pretty'
let currentOutput: 'stderr' | 'stdout' | string = 'stderr'
let includeTimestamp: boolean = true

const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }

// 获取调用堆栈信息
function getCallStack(): { file?: string; line?: number; column?: number } {
  const stack = new Error().stack || ''
  const lines = stack.split('\n')
  // 寻找调用 logger 函数的位置（跳过前3行：Error, getCallStack, log函数本身）
  for (let i = 3; i < lines.length; i++) {
    const match = lines[i].match(/\((.+?):(\d+):(\d+)\)/)
    if (match) {
      return {
        file: match[1],
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10)
      }
    }
  }
  return {}
}

export function configureLogger(opts: LoggerOptions = {}) {
  if (opts.level) currentLevel = opts.level
  if (opts.format) currentFormat = opts.format
  if (opts.output) currentOutput = opts.output
  if (opts.timestamp !== undefined) includeTimestamp = opts.timestamp
}

function shouldLog(level: Level): boolean {
  return order[level] >= order[currentLevel]
}

function formatTimestamp(): string {
  return new Date().toISOString()
}

function formatLine(level: Level, msg: string, ctx?: LogContext): string {
  const timestamp = includeTimestamp ? formatTimestamp() : ''
  const stackInfo = getCallStack()
  
  const logData = {
    level,
    msg,
    timestamp,
    ...stackInfo,
    ...ctx
  }
  
  // 处理错误对象
  if (ctx?.error instanceof Error) {
    logData.error = {
      message: ctx.error.message,
      name: ctx.error.name,
      stack: ctx.error.stack
    }
  }
  
  if (currentFormat === 'json') {
    return JSON.stringify(logData)
  }
  
  // 美化格式
  const parts = []
  if (timestamp) {
    parts.push(`[${timestamp}]`)
  }
  parts.push(`[${level.toUpperCase()}]`)
  parts.push(msg)
  
  // 格式化上下文信息
  if (ctx && Object.keys(ctx).length) {
    const ctxParts: string[] = []
    for (const [key, value] of Object.entries(ctx)) {
      if (value instanceof Error) {
        ctxParts.push(`${key}: ${value.message}`)
      } else if (typeof value === 'object' && value !== null) {
        ctxParts.push(`${key}: ${JSON.stringify(value)}`)
      } else {
        ctxParts.push(`${key}: ${value}`)
      }
    }
    if (ctxParts.length) {
      parts.push(`{ ${ctxParts.join(', ')} }`)
    }
  }
  
  return parts.join(' ')
}

function writeLog(line: string): void {
  if (currentOutput === 'stderr') {
    process.stderr.write(line + '\n')
  } else if (currentOutput === 'stdout') {
    process.stdout.write(line + '\n')
  } else {
    // 写入文件（简单实现，生产环境应该使用更可靠的文件写入方式）
    try {
      require('fs').appendFileSync(currentOutput, line + '\n', 'utf8')
    } catch (error) {
      process.stderr.write(`[ERROR] Failed to write log to file: ${error instanceof Error ? error.message : String(error)}\n`)
      process.stderr.write(line + '\n')
    }
  }
}

// 基本日志函数
export function debug(msg: string, ctx?: LogContext): void {
  if (shouldLog('debug')) {
    writeLog(formatLine('debug', msg, ctx))
  }
}

export function info(msg: string, ctx?: LogContext): void {
  if (shouldLog('info')) {
    writeLog(formatLine('info', msg, ctx))
  }
}

export function warn(msg: string, ctx?: LogContext): void {
  if (shouldLog('warn')) {
    writeLog(formatLine('warn', msg, ctx))
  }
}

export function error(msg: string, ctx?: LogContext): void {
  if (shouldLog('error')) {
    writeLog(formatLine('error', msg, ctx))
  }
}

// 增强的错误处理函数
export function handleError(err: Error, context?: string, ctx?: LogContext): void {
  const errorCtx = {
    ...ctx,
    error: err,
    context
  }
  error(`Error occurred: ${err.message}`, errorCtx)
}

// 统一的错误包装函数
export class I18nRefactorError extends Error {
  constructor(message: string, public context?: any) {
    super(message)
    this.name = 'I18nRefactorError'
  }
}

