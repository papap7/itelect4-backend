import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import mongoose from "mongoose";

const { connectDB } = vi.hoisted(() => ({
  connectDB: vi.fn(async () => {}),
}));

vi.mock("../src/config/db", () => ({ connectDB }));

import { app } from "../src/app";

beforeEach(() => {
  connectDB.mockReset();
  connectDB.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/health", () => {
  it("answers ok with db: true when Mongoose is connected", async () => {
    vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1);

    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, db: true });
  });

  it("reports db: false when Mongoose is not connected", async () => {
    vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(0);

    const res = await request(app).get("/api/health");

    expect(res.body).toEqual({ ok: true, db: false });
  });
});

describe("the connectDB middleware", () => {
  it("waits for the database before every route", async () => {
    await request(app).get("/api/health");
    await request(app).get("/api/nothing-here");

    expect(connectDB).toHaveBeenCalledTimes(2);
  });

  it("turns a failed connection into a JSON 500 instead of a hung request", async () => {
    connectDB.mockRejectedValue(new Error("Atlas unreachable"));

    const res = await request(app).get("/api/health");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: "Something went wrong" });
    expect(JSON.stringify(res.body)).not.toContain("Atlas");
  });
});

describe("404 handler", () => {
  it("answers unknown GET paths with JSON naming the method and path", async () => {
    const res = await request(app).get("/api/nothing-here");

    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toEqual({ message: "No route for GET /api/nothing-here" });
  });

  it("answers a known path with an unsupported method the same way", async () => {
    const res = await request(app).delete("/api/workspaces");

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("No route for DELETE /api/workspaces");
  });

  it("answers the bare root with JSON too, not Express's HTML page", async () => {
    const res = await request(app).get("/");

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("No route for GET /");
  });
});

describe("headers on every response", () => {
  it("sends Cache-Control: no-store and no ETag on success and on error", async () => {
    const ok = await request(app).get("/api/health");
    const missing = await request(app).get("/api/nothing-here");

    for (const res of [ok, missing]) {
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(res.headers.etag).toBeUndefined();
    }
  });
});

describe("a request body express.json() cannot read", () => {
  it("answers broken JSON with 400, not 500, and logs nothing", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send('{"email": "ana@cloudops.test",');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "The request body is not valid JSON" });
    // A 500 is logged as a bug in this app; a client's broken JSON is not one.
    expect(console.error).not.toHaveBeenCalled();
  });

  it("answers a body over express.json()'s 100 kB limit with 413", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ email: "x".repeat(200_000) }));

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ message: "The request body is too large" });
  });

  it("still sends the CORS and no-store headers on that 400", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Origin", "http://localhost:5173")
      .set("Content-Type", "application/json")
      .send("{");

    expect(res.status).toBe(400);
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});
