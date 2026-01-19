import { defineConfig } from 'vite';

export default defineConfig({
    root: 'src',
    publicDir: false,
    server: {
        port: 4445,
        fs: {
            // Allow serving files from the parent directory
            allow: ['..'],
        },
    },
    build: {
        outDir: '../dist',
        emptyOutDir: true,
    },
});
