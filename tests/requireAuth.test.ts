import "dotenv/config";
import { describe, it, expect, vi } from "vitest";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { requireAuth } from "../src/middleware/auth";

// requireAuth on its own: a fake request with only the header it reads,
// and a fake response that records what was sent.
function run(authorization?: string) {
  const req = { headers: { authorization } } as unknown as Request;
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;

  requireAuth(req, res as unknown as Response, next);
  return { req, res, next };
}

const sign = (payload: object, secret = process.env.JWT_SECRET!, options: jwt.SignOptions = {}) =>
  jwt.sign(payload, secret, options);

describe("requireAuth", () => {
  it("calls next() and sets req.userId for a valid token", () => {
    const { req, res, next } = run(`Bearer ${sign({ userId: "u-1" })}`);

    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBe("u-1");
    expect(res.body).toBeUndefined();
  });

  it("answers 401 when there is no Authorization header", () => {
    const { res, next } = run(undefined);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({
      message: "No token. Send Authorization: Bearer <token>",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("answers 401 for a different scheme, such as Basic", () => {
    const { res, next } = run("Basic YW5hOnBhc3N3b3Jk");

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("answers 401 for a token that is not a JWT", () => {
    const { res, next } = run("Bearer not.a.jwt");

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ message: "Token is invalid or has expired" });
    expect(next).not.toHaveBeenCalled();
  });

  it("answers 401 for an expired token", () => {
    const expired = sign({ userId: "u-1", exp: Math.floor(Date.now() / 1000) - 60 });

    const { res, next } = run(`Bearer ${expired}`);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("answers 401 for a token signed with another secret", () => {
    const { res, next } = run(`Bearer ${sign({ userId: "u-1" }, "attacker-secret")}`);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('answers 401 for an unsigned token ("alg": "none")', () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(JSON.stringify({ userId: "admin" })).toString("base64url");

    const { res, next } = run(`Bearer ${header}.${body}.`);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("answers 401 for a token whose payload was edited after signing", () => {
    const [h, , s] = sign({ userId: "u-1" }).split(".");
    const edited = Buffer.from(JSON.stringify({ userId: "someone-else" })).toString("base64url");

    const { res, next } = run(`Bearer ${h}.${edited}.${s}`);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});
