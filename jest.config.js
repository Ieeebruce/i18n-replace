module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/scripts/i18n-refactor/tests'],
  modulePaths: ['<rootDir>/scripts/i18n-refactor/src'],
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/scripts/i18n-refactor/tsconfig.json'
    }
  }
}
