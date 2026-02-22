import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { signIn } from "$root/auth";
import { registerSchema } from "$lib/schemas/auth";
import { hashPassword } from "$lib/server/auth/password";
import { getDb } from "$lib/server/db";
import { users } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import { env } from "$env/dynamic/private";

type FormErrors = { errors: Record<string, string[]>; email: string };

function formError(errors: Record<string, string[]>, email: string) {
  return fail(400, { errors, email } satisfies FormErrors);
}

export const load: PageServerLoad = async (event) => {
  const session = await event.locals.auth();
  if (session?.user) throw redirect(303, "/");
};

export const actions: Actions = {
  default: async (event) => {
    const formData = await event.request.formData();
    const rawData = Object.fromEntries(formData);

    const result = registerSchema.safeParse(rawData);
    if (!result.success) {
      const errors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0]?.toString() ?? "_";
        errors[field] = errors[field] ?? [];
        errors[field].push(issue.message);
      }
      return formError(errors, rawData.email as string);
    }

    const { email, password } = result.data;

    const databaseUrl =
      event.platform?.env?.DATABASE_URL ?? env.DATABASE_URL ?? "";
    const db = await getDb(databaseUrl);

    // Check for duplicate email
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing) {
      return formError({ email: ["Unable to create account with this email"] }, email);
    }

    // Create user with hashed password
    const passwordHash = await hashPassword(password);
    await db.insert(users).values({
      email,
      passwordHash,
      name: email.split("@")[0],
    });

    // Auto-sign in via Auth.js after registration
    try {
      const body = new URLSearchParams({
        providerId: "credentials",
        email,
        password,
        redirectTo: "/",
      });

      const signInRequest = new Request(event.request.url, {
        method: "POST",
        headers: new Headers({
          "Content-Type": "application/x-www-form-urlencoded",
          cookie: event.request.headers.get("cookie") ?? "",
          host: event.request.headers.get("host") ?? event.url.host,
        }),
        body,
      });

      const signInEvent = Object.create(event, {
        request: { value: signInRequest, enumerable: true },
      });

      await signIn(signInEvent);
    } catch (e) {
      // SvelteKit redirect on success — let it through
      if (
        e !== null &&
        e !== undefined &&
        typeof e === "object" &&
        "status" in e &&
        "location" in e
      ) {
        throw e;
      }

      // Sign-in failed after registration — redirect to login as fallback
      throw redirect(303, "/login?registered=true");
    }
  },
};
