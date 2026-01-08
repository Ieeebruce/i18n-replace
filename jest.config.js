module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/i18n-refactor/tests', '<rootDir>/i18n-refactor/test'],
  modulePaths: ['<rootDir>/i18n-refactor/src'],
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/i18n-refactor/tsconfig.json'
    }
  },
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/?(*.)+(spec|test).[tj]s?(x)'
  ],
  collectCoverage: true,
  coverageDirectory: '<rootDir>/i18n-refactor/coverage',
  coverageReporters: ['json', 'lcov', 'text', 'clover'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node']
}
