import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import request from "supertest";

// The two production frontends, exactly as CORS_ORIGIN holds them on
// Vercel. Set before app.ts is imported, because app.ts reads the
// variable once, when the module loads. vi.hoisted runs above imports.
const { OLD, NEW } = vi.hoisted(() => {
  const OLD = "https://itelect4-project-paulot.vercel.app";
  const NEW = "https://cloudops-portal-tenorio.vercel.app";
  vi.stubEnv("CORS_ORIGIN", `${OLD},${NEW}`);
  return { OLD, NEW };
});

vi.mock("../src/config/db", () => ({ connectDB: async () => {} }));

import { app } from "../src/app";
import { parseOrigins } from "../src/config/cors";
import { Workspace } from "../src/models/Workspace";
import { WORKSPACES } from "../src/data/workspaces";
import { fakeCollection } from "./helpers/fakeDb";

beforeEach(async () => {
  fakeCollection(Workspace);
  await Workspace.create(WORKSPACES);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("CORS: each frontend gets its own Access-Control-Allow-Origin", () => {
  it("answers the new domain with the new domain", async () => {
    const res = await request(app).get("/api/workspaces").set("Origin", NEW);

    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe(NEW);
  });

  it("answers the old domain with the old domain", async () => {
    const res = await request(app).get("/api/workspaces").set("Origin", OLD);

    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe(OLD);
  });

  it("sends no Access-Control-Allow-Origin to an origin that is not listed", async () => {
    // The server still answers; it is the browser that refuses to hand
    // the response to the other site's JavaScript, because this header
    // is missing.
    const res = await request(app)
      .get("/api/workspaces")
      .set("Origin", "https://cloudops-portal.vercel.app");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("answers a preflight from the new domain for an authenticated POST", async () => {
    const res = await request(app)
      .options("/api/provision-requests")
      .set("Origin", NEW)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "authorization,content-type");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(NEW);
    expect(res.headers["access-control-allow-methods"]).toContain("POST");
    expect(res.headers["access-control-allow-headers"]).toBe(
      "authorization,content-type",
    );
  });
});

describe("Caching: one browser, two frontends (the Nov 12 bug)", () => {
  it("sends Vary: Origin, so no cache treats two origins' answers as one", async () => {
    const res = await request(app).get("/api/workspaces").set("Origin", NEW);

    expect(res.headers.vary).toMatch(/\bOrigin\b/);
  });

  it("tells the browser not to store API responses at all", async () => {
    const res = await request(app).get("/api/workspaces").set("Origin", NEW);

    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("sends no ETag, so there is nothing to revalidate with", async () => {
    const res = await request(app).get("/api/workspaces").set("Origin", NEW);

    expect(res.headers.etag).toBeUndefined();
  });

  it("never answers 304 to the second domain with the first domain's copy", async () => {
    // What the browser did before the fix: it had the old domain's
    // response stored, and on the new domain it sent that copy's ETag
    // back as If-None-Match. Same body, same ETag, so the API said
    // 304 Not Modified -- and the browser reused the stored response,
    // Access-Control-Allow-Origin for the OLD domain included.
    const first = await request(app).get("/api/workspaces").set("Origin", OLD);
    const storedValidator = first.headers.etag ?? 'W/"stored-by-browser"';

    const second = await request(app)
      .get("/api/workspaces")
      .set("Origin", NEW)
      .set("If-None-Match", storedValidator);

    expect(second.status).toBe(200);
    expect(second.headers["access-control-allow-origin"]).toBe(NEW);
    expect(second.body).toHaveLength(6);
  });

  it("serves old -> new -> old in one session, each with its own origin", async () => {
    for (const origin of [OLD, NEW, OLD]) {
      const res = await request(app).get("/api/workspaces").set("Origin", origin);

      expect(res.status).toBe(200);
      expect(res.headers["access-control-allow-origin"]).toBe(origin);
      expect(res.body).toHaveLength(6);
    }
  });

  it("applies no-store to every kind of response, not just the happy path", async () => {
    const health = await request(app).get("/api/health").set("Origin", NEW);
    const notFound = await request(app).get("/api/nope").set("Origin", NEW);
    const noToken = await request(app)
      .get("/api/provision-requests")
      .set("Origin", NEW);

    expect(health.headers["cache-control"]).toBe("no-store");
    expect(notFound.status).toBe(404);
    expect(notFound.headers["cache-control"]).toBe("no-store");
    expect(noToken.status).toBe(401);
    expect(noToken.headers["cache-control"]).toBe("no-store");
  });
});

describe("parseOrigins (how CORS_ORIGIN is read)", () => {
  it("splits the production value into the two frontends", () => {
    expect(parseOrigins(`${OLD},${NEW}`)).toEqual([OLD, NEW]);
  });

  it("ignores spaces and a trailing comma", () => {
    expect(parseOrigins(` ${OLD} , ${NEW} ,`)).toEqual([OLD, NEW]);
  });

  it("falls back to the Vite dev server when the variable is not set", () => {
    expect(parseOrigins(undefined)).toEqual(["http://localhost:5173"]);
  });

  it("allows nothing when the variable is set but empty", () => {
    // CORS_ORIGIN= copied from .env.example, left blank. Not undefined,
    // so there is no fallback: set it to http://localhost:5173 locally.
    expect(parseOrigins("")).toEqual([]);
  });

  it("keeps a trailing slash, which then matches no browser Origin", () => {
    // Browsers send Origin with no path. A value saved in Vercel as
    // ".../" would allow nothing -- and the variable is a secret, so
    // nobody can look at it to see why.
    const [origin] = parseOrigins(`${NEW}/`);
    expect(origin).not.toBe(NEW);
  });
});
