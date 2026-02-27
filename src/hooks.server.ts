import { sequence } from "@sveltejs/kit/hooks";
import type { Handle } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";
import { handle as authHandle } from "./auth";
import { RateLimiter } from "$lib/server/rate-limit";

// Per-isolate rate limiters (see rate-limit.ts for distributed deployment notes)
const authLimiter = new RateLimiter(10, 60_000); // 10 req/min
const aiLimiter = new RateLimiter(20, 60_000); // 20 req/min

const rateLimitHandle: Handle = async ({ event, resolve }) => {
  if (event.request.method !== "POST") return resolve(event);

  const { pathname } = event.url;
  const ip = event.getClientAddress();

  let result: { allowed: boolean; retryAfterMs?: number } | null = null;

  if (pathname === "/login" || pathname === "/register") {
    result = authLimiter.check(ip);
  } else if (
    (pathname.startsWith("/queue/") && pathname.endsWith("/chat")) ||
    (pathname.startsWith("/personas/") &&
      (pathname.endsWith("/voice") || pathname.endsWith("/calibrate")))
  ) {
    result = aiLimiter.check(ip);
  }

  if (result && !result.allowed) {
    const retryAfter = Math.ceil((result.retryAfterMs ?? 60_000) / 1000);
    return json({ error: "Too many requests" }, {
      status: 429,
      headers: { "Retry-After": String(retryAfter) },
    });
  }

  return resolve(event);
};

const securityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
};

export const handle = sequence(rateLimitHandle, securityHeaders, authHandle);
