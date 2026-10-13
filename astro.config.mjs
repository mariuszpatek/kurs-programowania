// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://mariuszpatek.github.io',
  base: '/kurs-programowania',
  trailingSlash: 'always',
  build: { format: 'directory' },
});
