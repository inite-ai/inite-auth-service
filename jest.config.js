module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    // ts-jest handles TS via its own loader; piping JS through it
    // lets us also transpile ESM-only packages (jose) on the fly.
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  // jose ships ESM-only. The default jest config skips node_modules
  // transforms, so we whitelist jose so ts-jest sees and rewrites it.
  transformIgnorePatterns: ['node_modules/(?!(jose)/)'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.module.ts', '!src/main.ts', '!src/migrations/**'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
}
