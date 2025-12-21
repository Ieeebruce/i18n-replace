"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigError = exports.ValidationError = exports.IOError = exports.ParseError = void 0;
class ParseError extends Error {
    constructor(message, file) { super(message); this.name = 'ParseError'; this.file = file; }
}
exports.ParseError = ParseError;
class IOError extends Error {
    constructor(message, file) { super(message); this.name = 'IOError'; this.file = file; }
}
exports.IOError = IOError;
class ValidationError extends Error {
    constructor(message, detail) { super(message); this.name = 'ValidationError'; this.detail = detail; }
}
exports.ValidationError = ValidationError;
class ConfigError extends Error {
    constructor(message) { super(message); this.name = 'ConfigError'; }
}
exports.ConfigError = ConfigError;
