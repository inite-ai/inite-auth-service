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
  // Ratchet floor: set a few points below the measured baseline
  // (stmts 44.5 / branch 39.2 / funcs 41.2 / lines 43.9) so `test:cov`
  // fails on a regression without flaking on run-to-run jitter. Raise the
  // floor as coverage climbs — never lower it.
  coverageThreshold: {
    global: {
      statements: 42,
      branches: 37,
      functions: 39,
      lines: 42,
    },
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
}
