import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  // GitHub Pages 项目站点部署在子路径下，静态资源需以此为基准
  base: '/Intelligent-question-generation-project/',
})
