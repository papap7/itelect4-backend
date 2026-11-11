import { describe, it, expect, vi, afterEach } from "vitest";
import type { Document } from "mongoose";
import { Engineer } from "../src/models/Engineer";
import { ProvisionRequest } from "../src/models/ProvisionRequest";
import { Workspace } from "../src/models/Workspace";
import { ProvisionStatus } from "../src/types/index";
import { fakeCollection } from "./helpers/fakeDb";
import { newUserId } from "./helpers/auth";

afterEach(() => {
  vi.restoreAllMocks();
});

// The paths that fail validation, checked without touching a database.
const errorsOf = (doc: Document) => Object.keys(doc.validateSync()?.errors ?? {});

describe("Engineer model", () => {
  it("never puts the password in JSON, even when it was loaded", () => {
    const engineer = new Engineer({ name: "Ana", email: "a@x.test", password: "secret-123" });

    const json = engineer.toJSON() as Record<string, unknown>;

    expect(json).not.toHaveProperty("password");
    expect(json.id).toBe(String(engineer._id));
    expect(json).not.toHaveProperty("_id");
  });

  it("does not return the password hash from a normal query", async () => {
    fakeCollection(Engineer);
    await Engineer.create({ name: "Ana", email: "a@x.test", password: "secret-123" });

    const plain = await Engineer.findOne({ email: "a@x.test" });
    const withPassword = await Engineer.findOne({ email: "a@x.test" }).select("+password");

    expect(plain?.password).toBeUndefined();
    expect(withPassword?.password).toMatch(/^\$2/);
  });

  it("rehashes only when the password changes", async () => {
    const db = fakeCollection(Engineer);
    const engineer = await Engineer.create({ name: "Ana", email: "a@x.test", password: "secret-123" });
    const firstHash = engineer.password;

    // Without the isModified check, saving any change would hash the
    // hash, and the real password would stop working.
    engineer.name = "Ana R.";
    await engineer.save();

    expect(engineer.password).toBe(firstHash);
    expect(db.docs[0]).toMatchObject({ name: "Ana R.", password: firstHash });
  });

  it("only allows the three roles", () => {
    const engineer = new Engineer({ name: "A", email: "a@x.test", password: "secret-123", role: "root" });

    expect(errorsOf(engineer)).toEqual(["role"]);
  });

  it("defaults to an active developer", () => {
    const engineer = new Engineer({ name: "A", email: "a@x.test", password: "secret-123" });

    expect(engineer.role).toBe("developer");
    expect(engineer.isActive).toBe(true);
  });
});

describe("ProvisionRequest model", () => {
  it("defaults to PendingReview with requestedAt set to now", () => {
    const before = Date.now();
    const pr = new ProvisionRequest({ engineerId: newUserId(), workspaceId: 101, resourceType: "S3 bucket" });

    expect(pr.status).toBe(ProvisionStatus.PendingReview);
    expect(pr.requestedAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("requires an engineerId", () => {
    const pr = new ProvisionRequest({ workspaceId: 101, resourceType: "S3 bucket" });

    expect(errorsOf(pr)).toEqual(["engineerId"]);
  });

  it("accepts every ProvisionStatus value", () => {
    for (const status of [0, 1, 2, 3, 4]) {
      const pr = new ProvisionRequest({ engineerId: newUserId(), workspaceId: 101, resourceType: "S3 bucket", status });
      expect(errorsOf(pr)).toEqual([]);
    }
  });

  it("trims resourceType before checking its length", () => {
    const pr = new ProvisionRequest({ engineerId: newUserId(), workspaceId: 101, resourceType: "  vm  " });

    expect(pr.resourceType).toBe("vm");
    expect(errorsOf(pr)).toEqual(["resourceType"]);
  });
});

describe("Workspace model", () => {
  it("exposes workspaceId as a string id in JSON", () => {
    const ws = new Workspace({ workspaceId: 101, title: "T", description: "D", createdAt: new Date() });

    expect(ws.toJSON()).toMatchObject({ id: "101", workspaceId: 101 });
  });

  it("rejects an id below 101", () => {
    const ws = new Workspace({ workspaceId: 100, title: "T", description: "D", createdAt: new Date() });

    expect(errorsOf(ws)).toEqual(["workspaceId"]);
  });
});
