import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'VitePress Template Site',
  description: 'Starter content for a template-derived VitePress deployment',
  themeConfig: {
    sidebar: [
      { text: 'Home', link: '/' },
      { text: 'Resume', link: '/Resume/' }
    ]
  }
})
