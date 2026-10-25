import { defineConfig } from 'vitest/config';

// One Vitest project per area, so `npm test` runs everything and failures say where they live.
export default defineConfig({
  test: {
    projects: [
      { extends: true, test: { name: 'content', include: ['packages/content/**/*.test.ts'] } },
      { extends: true, test: { name: 'sim', include: ['packages/sim/**/*.test.ts'] } },
      { extends: true, test: { name: 'protocol', include: ['packages/protocol/**/*.test.ts'] } },
      { extends: true, test: { name: 'art', include: ['packages/art/**/*.test.ts'] } },
      { extends: true, test: { name: 'client', include: ['apps/client/src/**/*.test.ts'] } },
      { extends: true, test: { name: 'tools', include: ['tools/**/*.test.ts'] } },
      { extends: true, test: { name: 'repo', include: ['test/**/*.test.ts'] } },
    ],
  },
});
