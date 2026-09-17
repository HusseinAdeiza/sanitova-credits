import { build as viteBuild, defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

async function main() {
  const config = defineConfig({
    plugins: [react()],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:4000',
          changeOrigin: true,
        },
      },
    },
  });

  console.log('Starting Vite build...');
  await viteBuild(config);
  console.log('Build complete!');
}

main().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
