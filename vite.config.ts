import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served at the root of app.clockinout.ca (GitHub Pages + custom domain),
// so no sub-path base is needed.
export default defineConfig({
    plugins: [react()],
    base: '/',
    build: { outDir: 'dist', sourcemap: false },
});
