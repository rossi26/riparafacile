// @ts-check
import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';
// https://astro.build/config



export default defineConfig({
  site: 'https://your-site-name.netlify.app', // Add your production URL here
  adapter: netlify(),
  });