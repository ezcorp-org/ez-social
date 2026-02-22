import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { signIn } from "$root/auth";
import { signInSchema } from "$lib/schemas/auth";

export const load: PageServerLoad = async (event) => {
  const session = await event.locals.auth();
  if (session?.user) throw redirect(303, "/");

  return {
    registered: event.url.searchParams.get("registered") === "true",
  };
};

export const actions: Actions = {
  default: async (event) => {
    // Clone formData before consuming it (signIn also needs it)
    const formData = await event.request.formData();
    const rawData = Object.fromEntries(formData);

    // Validate input first
    const result = signInSchema.safeParse(rawData);
    if (!result.success) {
      const errors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0]?.toString() ?? "_";
        errors[field] = errors[field] ?? [];
        errors[field].push(issue.message);
      }
      return fail(400, { errors, email: rawData.email as string });
    }

    const { email } = result.data;

    try {
      // Auth.js signIn wrapper reads formData from event.request.
      // It expects: providerId, email, password, redirectTo.
      // Since we already consumed formData, create a new Request with correct fields.
      const body = new URLSearchParams({
        providerId: "credentials",
        email: rawData.email as string,
        password: rawData.password as string,
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

      // Proxy the event to provide our new request
      const signInEvent = Object.create(event, {
        request: { value: signInRequest, enumerable: true },
      });

      // signIn will throw redirect(302, ...) on success
      await signIn(signInEvent);
    } catch (e) {
      // SvelteKit redirect — let it pass through
      if (
        e !== null &&
        e !== undefined &&
        typeof e === "object" &&
        "status" in e &&
        "location" in e
      ) {
        throw e;
      }

      // Auth.js error — invalid credentials
      return fail(400, { error: "Invalid email or password", email });
    }
  },
};
