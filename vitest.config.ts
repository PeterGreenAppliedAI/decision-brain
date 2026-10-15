import { defineConfig } from 'vitest/config';

// Only this project's tests: data/corpora holds cloned repositories with test suites of their own.
export default defineConfig({ test: { include: ['test/**/*.test.ts'] } });
