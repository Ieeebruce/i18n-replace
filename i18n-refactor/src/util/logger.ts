type Level = 'debug' | 'info' | 'warn' | 'error'
type Format = 'json' | 'pretty'

let currentLevel: Level = 'info'
let currentFormat: Format = 'pretty'

const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }

export function configureLogger(opts: { level?: Level; format?: Format } = {}) {
  if (opts.level) currentLevel = opts.level
  if (opts.format) currentFormat = opts.format
}

function shouldLog(level: Level) { return order[level] >= order[currentLevel] }

function formatLine(level: Level, msg: string, ctx?: Record<string, any>) {
  if (currentFormat === 'json') return JSON.stringify({ level, msg, ...ctx })
  const parts = [`[${level.toUpperCase()}]`, msg]
  if (ctx && Object.keys(ctx).length) parts.push(JSON.stringify(ctx))
  return parts.join(' ')
}

export function debug(msg: string, ctx?: Record<string, any>) { if (shouldLog('debug')) process.stderr.write(formatLine('debug', msg, ctx) + '\n') }
export function info(msg: string, ctx?: Record<string, any>) { if (shouldLog('info')) process.stderr.write(formatLine('info', msg, ctx) + '\n') }
export function warn(msg: string, ctx?: Record<string, any>) { if (shouldLog('warn')) process.stderr.write(formatLine('warn', msg, ctx) + '\n') }
export function error(msg: string, ctx?: Record<string, any>) { if (shouldLog('error')) process.stderr.write(formatLine('error', msg, ctx) + '\n') }

