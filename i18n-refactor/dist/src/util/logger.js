"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.error = exports.warn = exports.info = exports.debug = exports.configureLogger = void 0;
let currentLevel = 'info';
let currentFormat = 'pretty';
const order = { debug: 10, info: 20, warn: 30, error: 40 };
function configureLogger(opts = {}) {
    if (opts.level)
        currentLevel = opts.level;
    if (opts.format)
        currentFormat = opts.format;
}
exports.configureLogger = configureLogger;
function shouldLog(level) { return order[level] >= order[currentLevel]; }
function formatLine(level, msg, ctx) {
    if (currentFormat === 'json')
        return JSON.stringify({ level, msg, ...ctx });
    const parts = [`[${level.toUpperCase()}]`, msg];
    if (ctx && Object.keys(ctx).length)
        parts.push(JSON.stringify(ctx));
    return parts.join(' ');
}
function debug(msg, ctx) { if (shouldLog('debug'))
    process.stderr.write(formatLine('debug', msg, ctx) + '\n'); }
exports.debug = debug;
function info(msg, ctx) { if (shouldLog('info'))
    process.stderr.write(formatLine('info', msg, ctx) + '\n'); }
exports.info = info;
function warn(msg, ctx) { if (shouldLog('warn'))
    process.stderr.write(formatLine('warn', msg, ctx) + '\n'); }
exports.warn = warn;
function error(msg, ctx) { if (shouldLog('error'))
    process.stderr.write(formatLine('error', msg, ctx) + '\n'); }
exports.error = error;
