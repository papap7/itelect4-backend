// ===== SESSION 12: a NEW file =========================================
// One file, one JWT-protected route: POST /api/ai. Supertest sends
// real HTTP requests to the real Express app, without opening a port.

// Vitest does not read .env into process.env by itself (only server.ts
// does that, through this same import). So on your laptop this line is
// what gives tokenFor() its JWT_SECRET. dotenv never overwrites a
// variable that is already set, so on GitHub the value from the
// repository secret in ci.yml wins, and there is no .env to find.
import "dotenv/config";
import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../src/app";

// app.ts waits for connectDB() in front of every route, and there is
// no database here or on GitHub's machine. This replaces the whole
// src/config/db module, for this test file only, with one whose
// connectDB does nothing. Vitest moves vi.mock above the imports, so
// app.ts gets this version even though it is imported first.
vi.mock("../src/config/db", () => ({
  connectDB: async () => {},
}));

// A token made the way POST /api/auth/login makes one: the same
// payload shape ({ userId }), signed with the same JWT_SECRET. No
// engineer has to exist, because requireAuth only checks the signature.
function tokenFor(userId: string): string {
  return jwt.sign({ userId }, process.env.JWT_SECRET!, {
    expiresIn: "5m",
  });
}

describe("POST /api/ai", () => {
  it("answers 401 when there is no token", async () => {
    const res = await request(app)
      .post("/api/ai")
      .send({ prompt: "I need three Linux servers in AWS for a staging site." });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe(
      "No token. Send Authorization: Bearer <token>",
    );
  });

  it("answers 401 when the token was signed with another secret", async () => {
    // Looks like a real token, but only the server knows the real
    // JWT_SECRET, so requireAuth's jwt.verify rejects it.
    const forged = jwt.sign({ userId: "someone" }, "not-the-secret");

    const res = await request(app)
      .post("/api/ai")
      .set("Authorization", `Bearer ${forged}`)
      .send({ prompt: "I need three Linux servers in AWS for a staging site." });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Token is invalid or has expired");
  });

  it("lets a valid token through, then checks the body", async () => {
    // "Too short" is 9 characters, so aiRequestSchema refuses it
    // before adviseRequest() runs -- Gemini is never called, and the
    // database is never touched. Only the route itself answers 400, so
    // getting 400 (not 401) proves the token got past requireAuth.
    const res = await request(app)
      .post("/api/ai")
      .set("Authorization", `Bearer ${tokenFor("test-user")}`)
      .send({ prompt: "Too short" });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([
      "Describe your resource needs in at least 20 characters.",
    ]);
  });
});
