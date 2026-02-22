import { getDb } from "$lib/server/db";
import { createQueueService } from "./queue";
import { createPersonaService } from "./persona";
import { createChatService } from "./chat";
import { env } from "$env/dynamic/private";

export async function getServices(event: {
  platform?: { env?: { DATABASE_URL?: string; BROWSER?: import("@cloudflare/puppeteer").BrowserWorker } };
}) {
  const databaseUrl =
    event.platform?.env?.DATABASE_URL ?? env.DATABASE_URL ?? "";
  const db = await getDb(databaseUrl);
  return {
    queue: createQueueService(db),
    persona: createPersonaService(db),
    chat: createChatService(db),
    browser: event.platform?.env?.BROWSER,
  };
}
