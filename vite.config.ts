import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  // Logos and other static files live in assets/ and are served from the site root.
  publicDir: 'assets',
  resolve: { tsconfigPaths: true },
  plugins: [tanstackStart(), viteReact()],
})
