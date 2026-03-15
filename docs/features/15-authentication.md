# Seven Things Nobody Tells You About NextAuth v5

NextAuth v5 (now Auth.js) is the standard auth library for Next.js. The docs cover the happy path. This covers everything else — the errors you'll hit in a real project, why they happen, and how to fix them.

I built auth for a monorepo with Next.js 16, Zod v4, pnpm workspaces, and a Credentials provider. Every item below is something I hit or narrowly avoided because I'd seen it before on a previous project.

## Contents

1. [NEXT_REDIRECT Is an Exception](#1-next_redirect-is-an-exception)
2. [TS2742 in pnpm Monorepos](#2-ts2742-in-pnpm-monorepos)
3. [zodResolver Is Broken with Zod v4](#3-zodresolver-is-broken-with-zod-v4)
4. [Your Monorepo .env Is Invisible](#4-your-monorepo-env-is-invisible)
5. [Route Groups Can Silently Conflict](#5-route-groups-can-silently-conflict)
6. [Cookie Names Change in HTTPS](#6-cookie-names-change-in-https)
7. [The User Identity Trap](#7-the-user-identity-trap)

---

## 1. NEXT_REDIRECT Is an Exception

When `signIn()` succeeds, it doesn't return. It throws a `NEXT_REDIRECT` exception that Next.js catches internally to perform the redirect.

If you wrap `signIn()` in a try/catch, you swallow the redirect and the user stays on the login page after a successful login.

```typescript
// BROKEN — swallows the redirect
export async function login(formData: FormData) {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/dashboard",
    });
  } catch (error) {
    return { error: "Invalid credentials" };
  }
}
```

```typescript
// WORKS — no try/catch around signIn
export async function login(_prevState: unknown, formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await signIn("credentials", {
    email: parsed.data.email,
    password: parsed.data.password,
    redirectTo: "/dashboard",
  });
}
```

Validate before calling `signIn()`, not around it. If `signIn()` fails (bad credentials), NextAuth returns an error page or redirects to the error URL — it doesn't throw a catchable error.

## 2. TS2742 in pnpm Monorepos

The standard NextAuth setup destructures the exports:

```typescript
export const { handlers, auth, signIn, signOut } = NextAuth({ ... });
```

In a pnpm monorepo, this produces:

```
error TS2742: The inferred type of 'auth' cannot be named without a
reference to '../node_modules/next-auth/lib'. This is likely not portable.
A type annotation is necessary.
```

TypeScript can't infer the types across pnpm's strict symlink structure. The fix is explicit type annotations:

```typescript
import NextAuth from "next-auth";
import type { NextAuthResult } from "next-auth";

const nextAuth = NextAuth({ ... });

export const handlers: NextAuthResult["handlers"] = nextAuth.handlers;
export const auth: NextAuthResult["auth"] = nextAuth.auth;
export const signIn: NextAuthResult["signIn"] = nextAuth.signIn;
export const signOut: NextAuthResult["signOut"] = nextAuth.signOut;
```

This is four extra lines. It took me an hour to figure out the first time. The destructuring pattern works fine with npm and yarn because they hoist differently.

## 3. zodResolver Is Broken with Zod v4

Zod v4 implements the [Standard Schema](https://github.com/standard-schema/standard-schema) interface. The `zodResolver` from `@hookform/resolvers/zod` doesn't know about this — it targets Zod v3's `.parse()` API.

If you install Zod v4 and use `zodResolver`, your forms will appear to work but validation errors won't display. The resolver calls methods that don't exist on the v4 schema object and fails silently.

```typescript
// BROKEN with Zod v4
import { zodResolver } from "@hookform/resolvers/zod";

useForm({ resolver: zodResolver(loginSchema) });
```

```typescript
// WORKS with Zod v4
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";

useForm({ resolver: standardSchemaResolver(loginSchema) });
```

`standardSchemaResolver` works with any schema library that implements Standard Schema — Zod v4, Valibot, ArkType. It's one import change.

## 4. Your Monorepo .env Is Invisible

NextAuth reads `AUTH_SECRET` from `process.env`. In a monorepo, your `.env` is at the project root. Next.js loads `.env` from the directory containing `next.config.ts` — which in a monorepo is `apps/web/`, not the root.

The error is clear enough:

```
[auth][error] MissingSecret: Please define a `secret`.
```

But you've defined it. It's right there in `.env`. Next.js just can't see it.

I fixed this by loading the root `.env` in `next.config.ts`:

```typescript
import * as dotenv from "dotenv";
import { resolve } from "node:path";

dotenv.config({ path: resolve(import.meta.dirname, "../../.env") });
```

This runs before anything else in the Next.js process. The alternative is duplicating env vars in `apps/web/.env`, which works until someone updates one file and forgets the other.

## 5. Route Groups Can Silently Conflict

Next.js route groups — `(public)`, `(auth)`, `(dashboard)` — don't create URL segments. That's the point. But it means two route groups can both define `page.tsx` at the same level, and both map to `/`.

I had `(public)/page.tsx` for the landing page and `(dashboard)/page.tsx` for the dashboard home. Both mapped to `/`. Next.js doesn't always error — it picks one, and the other silently doesn't exist.

The fix: if your dashboard routes need to live at `/dashboard/*`, add a `dashboard/` folder inside the route group:

```
src/app/
  (public)/
    page.tsx              → /
  (dashboard)/
    layout.tsx            → sidebar + auth check
    dashboard/
      page.tsx            → /dashboard
      settings/page.tsx   → /dashboard/settings
```

The route group `(dashboard)` provides the layout. The folder `dashboard/` provides the URL segment.

## 6. Cookie Names Change in HTTPS

In development over HTTP, the session cookie is `authjs.session-token`. Behind HTTPS, it becomes `__Secure-authjs.session-token`.

This matters when you deploy behind a reverse proxy. Your login works locally, you deploy, and the session cookie is set but never read — because the app is looking for one name and the browser sent the other.

I haven't hit this yet on this project (still local), but I watched it happen on a previous one. The fix was `trustHost: true` in the NextAuth config, which I set from the start this time:

```typescript
const nextAuth = NextAuth({
  trustHost: true,
  // ...
});
```

Without `trustHost`, NextAuth also has issues determining the callback URL when running behind a proxy.

## 7. The User Identity Trap

This one is subtle. If you have a dev auth bypass (like an `X-Test-User` header for scripts), sessions created through that bypass are owned by a different user than sessions created through the real login flow.

On a previous project, I created paper trading sessions via a CLI script using `X-Test-User: admin`. That mapped to user ID `system`. When I logged into the dashboard as `admin@volatio.io`, that mapped to user ID `6a9a5373-...`. The dashboard showed zero sessions because they were scoped to a different user.

The fix is to not have two identity systems. If you need scripts to create data, have them authenticate the same way the UI does, or explicitly set the user ID to match the real account.

---

Seven specific problems, all from building real auth. The theme: NextAuth v5 works well once configured, but the defaults assume npm, single-directory projects, HTTP development, and Zod v3. If any of those assumptions don't hold — and in a modern monorepo, most of them don't — you need these fixes.
