import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import AskJoshGptPanel from './components/AskJoshGptPanel.vue'
import './custom.css'

const theme: Theme = {
  ...DefaultTheme,
  enhanceApp(ctx) {
    DefaultTheme.enhanceApp?.(ctx)
    ctx.app.component('AskJoshGptPanel', AskJoshGptPanel)
  }
}

export default theme
