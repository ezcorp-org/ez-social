import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    host: true,
    allowedHosts: ["nixos-amd.taile1c5b0.ts.net"],
  },
  ssr: {
    // pg is Node.js-only; externalize it so Vite dev doesn't bundle it.
    // In production (Workers), it's never imported due to URL-based branching.
    external: ["pg"],
  },
});
