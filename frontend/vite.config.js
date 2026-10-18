import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  // 相对路径：对 GitHub Pages 的子路径部署自动适配，
  // 仓库改名（如换到别的 repo）也不会导致资源 404/白屏
  base: './',
})
