import axios from 'axios'
import { clearAuth, getToken } from '../auth'

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://8.136.42.57:5000/api',
  timeout: 30000,
})

http.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

http.interceptors.response.use(
  (resp) => resp,
  (err) => {
    const status = err?.response?.status
    if (status === 401) {
      clearAuth()
      import('../router').then(({ router }) => {
        if (router.currentRoute.value.path !== '/login' && router.currentRoute.value.path !== '/landing') {
          router.push('/landing')
        }
      })
    }
    const data = err?.response?.data
    const isNetworkError = err?.message === 'Network Error'
    const message = isNetworkError
      ? '无法连接后端服务，请确认服务已启动或检查接口地址'
      : data?.error?.message || err?.message || '请求失败'
    const normalizedError = new Error(message)
    normalizedError.status = status
    normalizedError.data = data
    if (data?.error?.code === 'TRIAL_LIMIT_EXCEEDED') {
      window.dispatchEvent(new CustomEvent('iqg-trial-limit', { detail: data.trial }))
    }
    return Promise.reject(normalizedError)
  },
)
