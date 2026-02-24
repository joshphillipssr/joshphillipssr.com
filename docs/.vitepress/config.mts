import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Josh Phillips Sr',
  description: 'Infrastructure, automation, and AI operations portfolio',
  themeConfig: {
    logo: '/images/branding/josh-phillips-sr-logo.png',
    sidebar: [
      { text: 'Home', link: '/' },
      { text: 'Resume', link: '/resume/' },
      { text: 'Projects', link: '/projects/' }
    ]
  }
})
