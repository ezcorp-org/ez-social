import { SvelteKitAuth } from "@auth/sveltekit";
import Credentials from "@auth/sveltekit/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb } from "$lib/server/db";
import {
  users,
  accounts,
  sessions,
  verificationTokens,
} from "$lib/server/db/schema";
import { signInSchema } from "$lib/schemas/auth";
import { verifyPassword } from "$lib/server/auth/password";
import { eq } from "drizzle-orm";
import { env } from "$env/dynamic/private";

export const { handle, signIn, signOut } = SvelteKitAuth(async (event) => {
  // Workers: platform.env; Local dev: $env/dynamic/private
  const databaseUrl = event.platform?.env?.DATABASE_URL ?? env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  const db = await getDb(databaseUrl);

  return {
    adapter: DrizzleAdapter(db, {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }),
    providers: [
      Credentials({
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        authorize: async (credentials) => {
          const parsed = signInSchema.safeParse(credentials);
          if (!parsed.success) return null;

          const { email, password } = parsed.data;

          const [user] = await db
            .select()
            .from(users)
            .where(eq(users.email, email))
            .limit(1);

          if (!user || !user.passwordHash) return null;

          const valid = await verifyPassword(user.passwordHash, password);
          if (!valid) return null;

          return { id: user.id, email: user.email, name: user.name };
        },
      }),
    ],
    session: { strategy: "jwt" },
    pages: {
      signIn: "/login",
    },
    trustHost: true,
    callbacks: {
      jwt({ token, user }) {
        if (user) {
          token.id = user.id;
        }
        return token;
      },
      session({ session, token }) {
        if (session.user && token.id) {
          session.user.id = token.id as string;
        }
        return session;
      },
    },
  };
});
