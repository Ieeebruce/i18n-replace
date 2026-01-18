export interface ValidationResult {
  status: 'PASS' | 'FAIL' | 'MISSING' | 'SKIPPED';
  originalValue?: string;
  newValue?: string;
  message?: string;
}

export interface RefactorChange {
  file: string;
  start: number;
  end: number;
  originalCode: string;
  newCode: string;
  key: string; // The generated i18n key (e.g., 'home.title')
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  validation: ValidationResult;
  type: 'TS' | 'HTML';
}

export interface ComplexCase {
  file: string;
  line: number;
  code: string;
  reason: string;
}

export interface RefactorManifest {
  changes: RefactorChange[];
  complexCases: ComplexCase[];
  stats: {
    totalFiles: number;
    totalChanges: number;
    validationFailures: number;
  };
}

export interface AnalyzerResult {
  usages: I18nUsage[];
  complexCases: ComplexCase[];
}

export interface I18nUsage {
  file: string;
  start: number;
  end: number;
  sourceCode: string;
  path: string[]; // e.g. ['common', 'buttons', 'submit']
  kind: 'property_access' | 'interpolation' | 'assignment' | 'call_arg' | 'declaration_delete';
}
