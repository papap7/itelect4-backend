import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";

vi.mock("../src/config/db", () => ({ connectDB: async () => {} }));

import { app } from "../src/app";
import { Workspace } from "../src/models/Workspace";
import { WORKSPACES } from "../src/data/workspaces";
import { fakeCollection, type FakeCollection } from "./helpers/fakeDb";

let db: FakeCollection;

beforeEach(async () => {
  db = fakeCollection(Workspace);
  // Inserted in reverse, so a correct answer has to come from the sort.
  await Workspace.create([...WORKSPACES].reverse());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/workspaces", () => {
  it("is public: answers 200 with no Authorization header", async () => {
    const res = await request(app).get("/api/workspaces");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(6);
  });

  it("sorts by workspaceId, 101 to 106", async () => {
    const res = await request(app).get("/api/workspaces");

    expect(res.body.map((w: { id: string }) => w.id)).toEqual([
      "101", "102", "103", "104", "105", "106",
    ]);
  });

  it("sends id as a string and hides Mongo's _id and __v", async () => {
    const res = await request(app).get("/api/workspaces");
    const [first] = res.body;

    expect(first).toMatchObject({
      id: "101",
      workspaceId: 101,
      title: "A.D.A.M. Command Center",
    });
    expect(first).not.toHaveProperty("_id");
    expect(first).not.toHaveProperty("__v");
  });

  it("answers [] (not 404) when nothing has been seeded", async () => {
    db.docs.length = 0;

    const res = await request(app).get("/api/workspaces");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("GET /api/workspaces/:workspaceId", () => {
  it("finds one workspace by its numeric id", async () => {
    const res = await request(app).get("/api/workspaces/103");

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("CloudOps Kubernetes Fleet");
  });

  it("finds every seeded id", async () => {
    for (const { workspaceId, title } of WORKSPACES) {
      const res = await request(app).get(`/api/workspaces/${workspaceId}`);
      expect(res.status).toBe(200);
      expect(res.body.title).toBe(title);
    }
  });

  it("answers 404 with the id in the message when it does not exist", async () => {
    const res = await request(app).get("/api/workspaces/999");

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('No workspace with id "999"');
  });

  it("answers 400, not 500, for an id that is not a number", async () => {
    // Number("abc") is NaN, Mongoose refuses to cast it, and app.ts's
    // error handler turns the CastError into a 400.
    const res = await request(app).get("/api/workspaces/abc");

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/is not a valid id/);
  });
});

describe("WORKSPACES seed data", () => {
  it("has six workspaces with unique ids 101 to 106", () => {
    const ids = WORKSPACES.map((w) => w.workspaceId);

    expect(ids).toEqual([101, 102, 103, 104, 105, 106]);
    expect(new Set(ids).size).toBe(6);
  });

  it("passes the Workspace schema, so npm run seed cannot fail validation", () => {
    for (const workspace of WORKSPACES) {
      expect(new Workspace(workspace).validateSync()?.errors ?? {}).toEqual({});
    }
  });
});
