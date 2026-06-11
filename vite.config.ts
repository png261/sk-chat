import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'es2022',
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'SkChat',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: (id) => {
        // Mark all non-relative/non-alias node_modules packages as external
        return !id.startsWith('.') && !id.startsWith('@/') && !path.isAbsolute(id);
      },
      output: {
        assetFileNames: (assetInfo) =>
          assetInfo.name === 'style.css' ? 'index.css' : assetInfo.name ?? 'asset',
      },
    },
  },
});
