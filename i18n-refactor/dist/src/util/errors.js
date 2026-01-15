"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReplacementError = exports.AstProcessingError = exports.ConfigError = exports.ValidationError = exports.IOError = exports.ParseError = void 0;
class ParseError extends Error {
    constructor(message, file) {
        super(message);
        this.name = 'ParseError';
        this.file = file;
        // Ensure proper prototype chain for instanceof checks
        Object.setPrototypeOf(this, ParseError.prototype);
    }
}
exports.ParseError = ParseError;
class IOError extends Error {
    constructor(message, file) {
        super(message);
        this.name = 'IOError';
        this.file = file;
        // Ensure proper prototype chain for instanceof checks
        Object.setPrototypeOf(this, IOError.prototype);
    }
}
exports.IOError = IOError;
class ValidationError extends Error {
    constructor(message, detail) {
        super(message);
        this.name = 'ValidationError';
        this.detail = detail;
        // Ensure proper prototype chain for instanceof checks
        Object.setPrototypeOf(this, ValidationError.prototype);
    }
}
exports.ValidationError = ValidationError;
class ConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ConfigError';
        // Ensure proper prototype chain for instanceof checks
        Object.setPrototypeOf(this, ConfigError.prototype);
    }
}
exports.ConfigError = ConfigError;
// Additional error types for better error handling
class AstProcessingError extends Error {
    constructor(message, file, node) {
        super(message);
        this.name = 'AstProcessingError';
        this.file = file;
        this.node = node;
        Object.setPrototypeOf(this, AstProcessingError.prototype);
    }
}
exports.AstProcessingError = AstProcessingError;
class ReplacementError extends Error {
    constructor(message, file, originalText, newText) {
        super(message);
        this.name = 'ReplacementError';
        this.file = file;
        this.originalText = originalText;
        this.newText = newText;
        Object.setPrototypeOf(this, ReplacementError.prototype);
    }
}
exports.ReplacementError = ReplacementError;
