import { eq } from "drizzle-orm";
import { getDb } from "$lib/server/db";
import { users } from "$lib/server/db/schema";
import { AVAILABLE_MODELS } from "$lib/server/models";
import { env } from "$env/dynamic/private";
import type { RequestHandler } from "./$types";

const validModelIds = new Set<string>(AVAILABLE_MODELS.map((m) => m.id));

export const PUT: RequestHandler = async ({ request, locals, platform }) => {
  const session = await locals.auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: { model: string };
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (!body.model || !validModelIds.has(body.model)) {
    return new Response("Invalid model", { status: 400 });
  }

  const databaseUrl = platform?.env?.DATABASE_URL ?? env.DATABASE_URL ?? "";
  const db = await getDb(databaseUrl);

  await db
    .update(users)
    .set({ preferredModel: body.model })
    .where(eq(users.id, session.user.id));

  return Response.json({ model: body.model });
};
