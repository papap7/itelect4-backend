// Vitest does not load .env on its own. Locally this supplies JWT_SECRET;
// in CI the variable is already set by the workflow, and dotenv does not
// override existing values.
import "dotenv/config";
import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../src/app";

// app.ts awaits connectDB() before every route. Replace the module so the
// suite runs without MongoDB. vi.mock is hoisted above the imports.
vi.mock("../src/config/db", () => ({
  connectDB: async () => {},
}));

// Signs a token the same way POST /api/auth/login does. requireAuth only
// verifies the signature, so no matching user record is needed.
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
    const forged = jwt.sign({ userId: "someone" }, "not-the-secret");

    const res = await request(app)
      .post("/api/ai")
      .set("Authorization", `Bearer ${forged}`)
      .send({ prompt: "I need three Linux servers in AWS for a staging site." });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Token is invalid or has expired");
  });

  it("lets a valid token through, then checks the body", async () => {
    // The prompt is below the schema's 20-character minimum, so the route
    // responds 400 before calling Gemini. A 400 (rather than 401) confirms
    // the request passed requireAuth.
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
