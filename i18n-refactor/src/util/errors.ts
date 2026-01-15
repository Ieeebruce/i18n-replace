export class ParseError extends Error {
  file?: string
  constructor(message: string, file?: string) { 
    super(message); 
    this.name = 'ParseError'; 
    this.file = file;
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, ParseError.prototype);
  }
}

export class IOError extends Error {
  file?: string
  constructor(message: string, file?: string) { 
    super(message); 
    this.name = 'IOError'; 
    this.file = file;
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, IOError.prototype);
  }
}

export class ValidationError extends Error {
  detail?: any
  constructor(message: string, detail?: any) { 
    super(message); 
    this.name = 'ValidationError'; 
    this.detail = detail;
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class ConfigError extends Error {
  constructor(message: string) { 
    super(message); 
    this.name = 'ConfigError';
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, ConfigError.prototype);
  }
}

// Additional error types for better error handling
export class AstProcessingError extends Error {
  file?: string;
  node?: any;
  
  constructor(message: string, file?: string, node?: any) {
    super(message);
    this.name = 'AstProcessingError';
    this.file = file;
    this.node = node;
    Object.setPrototypeOf(this, AstProcessingError.prototype);
  }
}

export class ReplacementError extends Error {
  file?: string;
  originalText?: string;
  newText?: string;
  
  constructor(message: string, file?: string, originalText?: string, newText?: string) {
    super(message);
    this.name = 'ReplacementError';
    this.file = file;
    this.originalText = originalText;
    this.newText = newText;
    Object.setPrototypeOf(this, ReplacementError.prototype);
  }
}

