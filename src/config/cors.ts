// The Vite dev server, for when CORS_ORIGIN is not set at all.
export const DEV_ORIGIN = "http://localhost:5173";

// CORS_ORIGIN is one environment variable, comma-separated, so the list
// is different on your laptop and on Vercel without the code knowing
// which it is. Pulled out of app.ts into a function so the parsing can
// be tested on its own, without starting the app.
//
// Origins have no trailing slash: http://localhost:5173 not .../
// A browser's Origin header never has one, so ".../" matches nothing.
export function parseOrigins(raw: string | undefined): string[] {
  return (raw ?? DEV_ORIGIN)
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin !== "");
}

// ===== Vercel preview deployments of the frontend ====================
// Every frontend push to a branch other than main gets preview URLs:
//   https://<project>-<9-character hash>-<team>.vercel.app     (one per push)
//   https://<project>-git-<branch>-<team>.vercel.app           (latest on a branch;
//                                                              the PR comment links this one)
// New URLs appear with every push, so they cannot be listed in
// CORS_ORIGIN ahead of time; they are matched by pattern instead. The
// patterns live in code, not in the environment variable: CORS_ORIGIN
// is a Sensitive variable that can only be replaced, never read back,
// and replacing it once already dropped the preview URLs it held.
//
// Narrow on purpose: only this account's team, only this frontend
// project's names (the current one, and the one it had before
// Nov 12, 2026, whose earlier previews still exist), anchored with ^
// and $ so it is the whole origin or nothing.
//
// Why a pattern is acceptable here: this API uses no cookies. A
// browser only sends the Bearer token that the frontend itself put in
// the Authorization header, and that token lives in the frontend's own
// origin's storage. So CORS is not what protects user data -- the token
// is. An origin allowed by mistake could read only what is already
// public (the workspace list). Preview deployments are also behind
// Vercel's Deployment Protection, which asks for a Vercel login.
export const VERCEL_TEAM_SLUG = "papap7s-projects";
export const FRONTEND_PROJECT_NAMES = [
  "cloudops-portal",
  "itelect4-project-paulot",
] as const;

export const PREVIEW_ORIGIN_PATTERNS: RegExp[] = FRONTEND_PROJECT_NAMES.map(
  (name) =>
    new RegExp(
      `^https://${name}-(?:[a-z0-9]{9}|git-[a-z0-9-]+)-${VERCEL_TEAM_SLUG}\\.vercel\\.app$`,
    ),
);

// What app.ts passes to cors({ origin }). cors accepts a mix of exact
// strings and RegExps and answers each request with that request's own
// Origin when one of them matches.
export function allowedOrigins(raw: string | undefined): (string | RegExp)[] {
  return [...parseOrigins(raw), ...PREVIEW_ORIGIN_PATTERNS];
}
