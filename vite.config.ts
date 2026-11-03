import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Fixed port: Google sign-in only works from origins registered on the OAuth client.
  server: { port: 3000, strictPort: true },
  preview: { port: 3000, strictPort: true },
});
