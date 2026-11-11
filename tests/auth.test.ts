import "dotenv/config";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../src/config/db", () => ({ connectDB: async () => {} }));

import { app } from "../src/app";
import { Engineer } from "../src/models/Engineer";
import { fakeCollection, type FakeCollection } from "./helpers/fakeDb";

let db: FakeCollection;

const ANA = { name: "Ana Reyes", email: "ana@cloudops.test", password: "correct-horse" };

beforeEach(() => {
  db = fakeCollection(Engineer);
  // The error handler logs unexpected errors; keep test output readable.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function register(body: object) {
  return request(app).post("/api/auth/register").send(body);
}

function login(body: object) {
  return request(app).post("/api/auth/login").send(body);
}

describe("POST /api/auth/register", () => {
  it("creates the engineer and answers 201 without the password", async () => {
    const res = await register(ANA);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: "Ana Reyes",
      email: "ana@cloudops.test",
      role: "developer",
      isActive: true,
    });
    expect(res.body.id).toMatch(/^[a-f0-9]{24}$/);
    expect(res.body).not.toHaveProperty("password");
    expect(res.body).not.toHaveProperty("_id");
  });

  it("stores a bcrypt hash, never the plain password", async () => {
    await register(ANA);

    const stored = db.docs[0].password as string;
    expect(stored).not.toBe(ANA.password);
    expect(stored).toMatch(/^\$2[aby]\$10\$/);
  });

  it("trims the name and lowercases the email before saving", async () => {
    const res = await register({ ...ANA, name: "  Ana Reyes ", email: " ANA@CloudOps.TEST " });

    expect(res.body.name).toBe("Ana Reyes");
    expect(res.body.email).toBe("ana@cloudops.test");
  });

  it("ignores a role sent in the body: every new account is a developer", async () => {
    const res = await register({ ...ANA, role: "devops_admin" });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe("developer");
  });

  it("answers 409 when the email is already registered", async () => {
    await register(ANA);

    const res = await register({ ...ANA, name: "Someone Else" });

    expect(res.status).toBe(409);
    expect(res.body.message).toBe("That email is already registered");
    expect(db.docs).toHaveLength(1);
  });

  it("treats the same email in different case as already registered", async () => {
    await register(ANA);

    const res = await register({ ...ANA, email: "ANA@CLOUDOPS.TEST" });

    expect(res.status).toBe(409);
  });

  it("answers 400 when the password is shorter than 8 characters", async () => {
    const res = await register({ ...ANA, password: "short" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(res.body.errors).toEqual(["password must be at least 8 characters"]);
    // Mongoose's default message quoted the value it rejected, which
    // sent the password back in the response.
    expect(JSON.stringify(res.body)).not.toContain("short");
    expect(db.docs).toHaveLength(0);
  });

  it("answers 400 listing every missing field", async () => {
    const res = await register({});

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([
      "name is required",
      "email is required",
      "password is required",
    ]);
  });

  it("answers 400 when a field is not a string", async () => {
    const res = await register({ ...ANA, name: 42 });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(["name must be a string"]);
    expect(db.docs).toHaveLength(0);
  });

  it("refuses a MongoDB operator in place of the email before any query runs", async () => {
    const findOne = vi.spyOn(Engineer, "findOne");

    const res = await register({ ...ANA, email: { $ne: null } });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(["email must be a string"]);
    expect(findOne).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    await register(ANA);
  });

  it("answers 200 with a token and the user, without the password", async () => {
    const res = await login({ email: ANA.email, password: ANA.password });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(ANA.email);
    expect(res.body.user).not.toHaveProperty("password");
    expect(typeof res.body.token).toBe("string");
  });

  it("signs a token for this user that expires in 2 hours", async () => {
    const res = await login({ email: ANA.email, password: ANA.password });

    const payload = jwt.verify(res.body.token, process.env.JWT_SECRET!) as jwt.JwtPayload;
    expect(payload.userId).toBe(res.body.user.id);
    expect(payload.exp! - payload.iat!).toBe(2 * 60 * 60);
  });

  it("accepts the email in any case", async () => {
    const res = await login({ email: "Ana@CloudOps.Test", password: ANA.password });

    expect(res.status).toBe(200);
  });

  it("answers 401 for a wrong password", async () => {
    const res = await login({ email: ANA.email, password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Email or password is incorrect");
    expect(res.body).not.toHaveProperty("token");
  });

  it("answers an unknown email with the same 401, so emails cannot be probed", async () => {
    const wrongPassword = await login({ email: ANA.email, password: "wrong-password" });
    const unknownEmail = await login({ email: "nobody@cloudops.test", password: "whatever1" });

    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });

  it("answers 400, not 500, when the password is missing", async () => {
    // bcrypt.compare(undefined, hash) throws; this used to reach the
    // error handler as a 500.
    const res = await login({ email: ANA.email });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      message: "Validation failed",
      errors: ["password is required"],
    });
  });

  it("answers 400 when the password is not a string", async () => {
    const res = await login({ email: ANA.email, password: 12345678 });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(["password must be a string"]);
  });

  it("refuses a MongoDB operator in place of the email, and issues no token", async () => {
    // { $ne: null } would match the first engineer in the collection.
    const res = await login({ email: { $ne: null }, password: ANA.password });

    expect(res.status).toBe(400);
    expect(res.body).not.toHaveProperty("token");
  });

  it("issues a token that the protected routes accept", async () => {
    const { body } = await login({ email: ANA.email, password: ANA.password });

    // 400, not 401: requireAuth let it through and the AI route's own
    // validation answered. Gemini is never called.
    const res = await request(app)
      .post("/api/ai")
      .set("Authorization", `Bearer ${body.token}`)
      .send({ prompt: "short" });

    expect(res.status).toBe(400);
  });
});
