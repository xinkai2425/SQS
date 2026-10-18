import { createApp } from 'vue'
import { createPinia } from 'pinia'
import naive from 'naive-ui'
import './style.css'
import './motion.css'
import App from './App.vue'
import { router } from './router'
import { reveal } from './directives/reveal'

const app = createApp(App)

app.use(createPinia()).use(router).use(naive)
app.directive('reveal', reveal)
app.mount('#app')
