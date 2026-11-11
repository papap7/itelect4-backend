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
