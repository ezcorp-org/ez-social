import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

export function createDb(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return drizzleNeon({ client: sql, schema });
}

/**
 * Smart DB factory — uses neon HTTP for Neon-hosted DBs, pg for everything else
 * (local dev, Docker, self-hosted PostgreSQL).
 * Uses globalThis-based dynamic require to completely hide pg from bundlers.
 */
export async function getDb(databaseUrl: string) {
  const isNeon = databaseUrl.includes("neon.tech");
  if (isNeon) {
    return createDb(databaseUrl);
  }
  // Use Function constructor to create a truly dynamic import that bundlers can't analyze.
  // This only runs in Node.js/Bun environments, never on Workers.
  const dynamicImport = new Function("mod", "return import(mod)");
  const { drizzle } = await dynamicImport("drizzle-orm/node-postgres");
  const pg = await dynamicImport("pg");
  const pool = new pg.default.Pool({ connectionString: databaseUrl });
  return drizzle({ client: pool, schema });
}
