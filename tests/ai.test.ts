// Vitest does not load .env on its own. Locally this supplies JWT_SECRET;
// in CI the variable is already set by the workflow, and dotenv does not
// override existing values.
import "dotenv/config";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { ApiError } from "@google/genai";
import { app } from "../src/app";
import { adviseRequest, AiReplyError } from "../src/ai/gemini";
import { newUserId } from "./helpers/auth";

// app.ts awaits connectDB() before every route. Replace the module so the
// suite runs without MongoDB. vi.mock is hoisted above the imports.
vi.mock("../src/config/db", () => ({
  connectDB: async () => {},
}));

// Keep the real AiReplyError class (the route checks instanceof), but
// replace the one function that would call Gemini and spend quota.
vi.mock("../src/ai/gemini", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/ai/gemini")>()),
  adviseRequest: vi.fn(),
}));

const advise = vi.mocked(adviseRequest);

// Signs a token the same way POST /api/auth/login does. requireAuth only
// verifies the signature, so no matching user record is needed.
function tokenFor(userId: string): string {
  return jwt.sign({ userId }, process.env.JWT_SECRET!, {
    expiresIn: "5m",
  });
}

const PROMPT = "I need three Linux servers in AWS for a staging site.";

const ADVICE = {
  summary: "You want three Linux servers on AWS for staging.",
  suggestions: ["Say which region."],
  risks: ["Staging left running costs money."],
  urgency: "standard" as const,
};

// The limiter allows 5 requests a minute per account, and it remembers
// across tests. A fresh user per request keeps tests from sharing it.
function ask(body: object, userId = newUserId()) {
  return request(app)
    .post("/api/ai")
    .set("Authorization", `Bearer ${tokenFor(userId)}`)
    .send(body);
}

beforeEach(() => {
  advise.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/ai", () => {
  it("answers 401 when there is no token", async () => {
    const res = await request(app)
      .post("/api/ai")
      .send({ prompt: PROMPT });

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
      .send({ prompt: PROMPT });

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
    expect(advise).not.toHaveBeenCalled();
  });

  it("answers 400 for a prompt over 2000 characters, without calling Gemini", async () => {
    const res = await ask({ prompt: "x".repeat(2001) });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([
      "Keep the description under 2000 characters.",
    ]);
    expect(advise).not.toHaveBeenCalled();
  });

  it("answers 400 when there is no prompt at all", async () => {
    const res = await ask({});

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(advise).not.toHaveBeenCalled();
  });

  it("returns Gemini's checked advice as JSON, given the trimmed prompt", async () => {
    advise.mockResolvedValue(ADVICE);

    const res = await ask({ prompt: `   ${PROMPT}   ` });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(ADVICE);
    expect(advise).toHaveBeenCalledWith(PROMPT);
  });

  it("answers 429 with its own message when Gemini's quota is used up", async () => {
    advise.mockRejectedValue(new ApiError({ message: "quota", status: 429 }));

    const res = await ask({ prompt: PROMPT });

    expect(res.status).toBe(429);
    expect(res.body.message).toBe(
      "The AI quota is used up for now. Try again later.",
    );
  });

  it("answers 502 when Gemini's reply was unusable", async () => {
    advise.mockRejectedValue(new AiReplyError("Gemini's reply was not JSON"));

    const res = await ask({ prompt: PROMPT });

    expect(res.status).toBe(502);
    expect(res.body.message).toBe(
      "The AI service did not answer properly. Try again.",
    );
  });

  it("answers 502 for other Gemini API errors, without leaking Google's text", async () => {
    advise.mockRejectedValue(
      new ApiError({ message: "internal: secret detail", status: 500 }),
    );

    const res = await ask({ prompt: PROMPT });

    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain("secret detail");
  });

  it("answers 500 for a bug that is not Gemini's fault", async () => {
    advise.mockRejectedValue(new TypeError("cannot read x of undefined"));

    const res = await ask({ prompt: PROMPT });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: "Something went wrong" });
  });
});

describe("POST /api/ai rate limit", () => {
  it("allows 5 requests a minute per account and refuses the 6th with 429", async () => {
    advise.mockResolvedValue(ADVICE);
    const user = newUserId();

    for (let i = 0; i < 5; i++) {
      const ok = await ask({ prompt: PROMPT }, user);
      expect(ok.status).toBe(200);
    }
    const sixth = await ask({ prompt: PROMPT }, user);

    expect(sixth.status).toBe(429);
    expect(sixth.body.message).toBe(
      "Five reviews a minute is the limit. Try again shortly.",
    );
    expect(advise).toHaveBeenCalledTimes(5);
  });

  it("counts per account, so one user's limit does not block another", async () => {
    advise.mockResolvedValue(ADVICE);
    const busy = newUserId();
    for (let i = 0; i < 6; i++) await ask({ prompt: PROMPT }, busy);

    const other = await ask({ prompt: PROMPT });

    expect(other.status).toBe(200);
  });

  it("sends the standard RateLimit headers so the frontend can show when to retry", async () => {
    advise.mockResolvedValue(ADVICE);

    const res = await ask({ prompt: PROMPT });

    expect(res.headers["ratelimit-policy"]).toBeDefined();
    expect(res.headers["ratelimit"]).toMatch(/\br=4\b/);
  });
});
