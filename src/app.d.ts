// See https://svelte.dev/docs/kit/types#app.d.ts

declare global {
  namespace App {
    // interface Error {}
    // Auth.js manages locals via event.locals.auth()
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    interface Platform {
      env?: {
        DATABASE_URL: string;
        AUTH_SECRET: string;
        ANTHROPIC_API_KEY: string;
        BROWSER?: import("@cloudflare/puppeteer").BrowserWorker;
      };
    }
  }
}

export {};
