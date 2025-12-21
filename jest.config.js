module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/i18n-refactor/tests'],
  modulePaths: ['<rootDir>/i18n-refactor/src'],
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/i18n-refactor/tsconfig.json'
    }
  }
}
