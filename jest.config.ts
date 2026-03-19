import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '\\.module\\.css$': '<rootDir>/__mocks__/styleMock.ts',
    '^leaflet$': '<rootDir>/__mocks__/leaflet.ts',
  },
  transform: {
    '^.+\\.(t|j)sx?$': '@swc/jest',
  },
  testPathIgnorePatterns: ['/node_modules/', '/__tests__/fixtures/'],
  collectCoverage: true,
  coverageReporters: ['lcov'],
};

export default config;
