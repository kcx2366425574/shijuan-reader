import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { devProxyPlugin } from './tools/dev-proxy.js'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    uni(),
    devProxyPlugin()
  ]
})
