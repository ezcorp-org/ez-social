import { defineConfig } from "vitest/config";
import { sveltekit } from "@sveltejs/kit/vite";

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ["src/**/*.test.ts"],
    environment: "jsdom",
    globals: true,
    alias: {
      "$lib": "/src/lib",
      "$lib/*": "/src/lib/*",
      "$app/forms": "/src/test-utils/mocks/app-forms.ts",
      "$app/navigation": "/src/test-utils/mocks/app-navigation.ts",
      "$env/dynamic/private": "/src/test-utils/mocks/env.ts",
    },
  },
});
