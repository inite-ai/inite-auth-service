module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.module.ts', '!src/main.ts', '!src/migrations/**'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
}
