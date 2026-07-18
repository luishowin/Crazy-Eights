import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Served from https://<user>.github.io/Crazy-Eights/ on GitHub Pages,
// so assets must be referenced under that base. Local dev uses '/'.
const base = process.env.GITHUB_PAGES ? '/Crazy-Eights/' : '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Very Crazy Eights',
        short_name: 'Crazy 8s',
        description: 'A chaotic Kenyan-street-rules card game. Play vs bots or friends.',
        theme_color: '#0f5132',
        background_color: '#0b3d29',
        display: 'standalone',
        orientation: 'any',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
