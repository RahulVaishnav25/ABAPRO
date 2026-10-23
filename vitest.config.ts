import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['apps/api/test/**/*.test.ts', 'apps/web/src/**/*.test.ts', 'packages/shared/test/**/*.test.ts'],
    setupFiles: ['apps/api/test/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 90_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@abapro/shared': path.resolve(__dirname, 'packages/shared/src/index.ts'),
      '@': path.resolve(__dirname, 'apps/web/src'),
    },
  },
});
