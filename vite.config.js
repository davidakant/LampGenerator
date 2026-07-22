import { defineConfig } from 'vite';

// Relative asset paths ('./') so the built site works under any GitHub Pages
// subpath, e.g. https://<user>.github.io/LampGenerator/ — without this, Vite
// emits root-absolute /assets/... URLs that 404 on a project page.
export default defineConfig({
  base: './',
});
