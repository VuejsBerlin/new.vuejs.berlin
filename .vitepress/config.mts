import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Vuejs//Berlin",
  description: "Berlins community around the Vue Framework and its ecosystem. We meet monthly  every second Tuesday. Doors open at 19:00, talks usually start around 19:30.",
  lang: 'en',
  head: [
    ['link', { rel: 'icon', href: '/favicon.png' }],
    ['script', { 'data-goatcounter': 'https://vuejs-berlin.goatcounter.com/count', async: '', src: '//gc.zgo.at/count.js' }]
  ],
  vite: {
    define: {
      // The site is static, so the build time is "now" for every page. Baking
      // it in — instead of calling `Date.now()` at render time — keeps the
      // server-rendered HTML and the hydrated page identical.
      __BUILD_TIME__: JSON.stringify(new Date().toISOString())
    }
  },
})
