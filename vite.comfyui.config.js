import { defineConfig } from 'vite'

/**
 * Vite build configuration for the ComfyUI embedded editor.
 * Outputs to web/app/ which is served as static files by ComfyUI.
 *
 * Usage: npm run build:comfyui
 */
export default defineConfig({
  base: './',
  build: {
    outDir: 'web/app',
    emptyOutDir: true,
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        // Avoid hashed filenames so ComfyUI can reliably serve them
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
})
