import { defineConfig } from 'vitest/config';

// Pure modules only (no Astro components): the flowchart, prompts, Markdown, the model proxy.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
