import "dotenv/config";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";

vi.mock("../src/config/db", () => ({ connectDB: async () => {} }));

import { app } from "../src/app";
import { ProvisionRequest } from "../src/models/ProvisionRequest";
import { Workspace } from "../src/models/Workspace";
import { WORKSPACES } from "../src/data/workspaces";
import { ProvisionStatus } from "../src/types/index";
import { fakeCollection, type FakeCollection } from "./helpers/fakeDb";
import { bearer, newUserId } from "./helpers/auth";

let db: FakeCollection;
let ana: string;
let ben: string;

const VALID = { workspaceId: 103, resourceType: "t3.medium EC2 instance" };

beforeEach(async () => {
  // Creating a request now checks that its workspace exists, so the six
  // reference workspaces have to be "in the database" too.
  fakeCollection(Workspace);
  await Workspace.create(WORKSPACES);
  db = fakeCollection(ProvisionRequest);
  ana = newUserId();
  ben = newUserId();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function createAs(userId: string, body: object = VALID) {
  const res = await request(app)
    .post("/api/provision-requests")
    .set("Authorization", bearer(userId))
    .send(body);
  return res;
}

describe("every /api/provision-requests route is private", () => {
  const id = "6af49b72ebbed87b809ddaa3";
  const routes = [
    ["get", "/api/provision-requests"],
    ["get", `/api/provision-requests/${id}`],
    ["post", "/api/provision-requests"],
    ["patch", `/api/provision-requests/${id}`],
    ["delete", `/api/provision-requests/${id}`],
  ] as const;

  it.each(routes)("%s %s answers 401 with no token", async (method, path) => {
    const res = await request(app)[method](path).send(VALID);

    expect(res.status).toBe(401);
    expect(db.docs).toHaveLength(0);
  });
});

describe("POST /api/provision-requests", () => {
  it("creates a request owned by the token's user, PendingReview by default", async () => {
    const res = await createAs(ana);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      ...VALID,
      engineerId: ana,
      status: ProvisionStatus.PendingReview,
    });
    expect(res.body.id).toMatch(/^[a-f0-9]{24}$/);
    expect(new Date(res.body.requestedAt).getTime()).not.toBeNaN();
    expect(res.body).not.toHaveProperty("_id");
  });

  it("ignores an engineerId in the body: you cannot file a request as someone else", async () => {
    const res = await createAs(ana, { ...VALID, engineerId: ben });

    expect(res.status).toBe(201);
    expect(res.body.engineerId).toBe(ana);
  });

  it("ignores a requestedAt in the body: the server sets the time", async () => {
    const res = await createAs(ana, { ...VALID, requestedAt: "2020-01-01T00:00:00.000Z" });

    expect(res.status).toBe(201);
    expect(new Date(res.body.requestedAt).getFullYear()).not.toBe(2020);
  });

  it("answers 400 for a workspace that does not exist, and saves nothing", async () => {
    const res = await createAs(ana, { ...VALID, workspaceId: 999 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      message: "Validation failed",
      errors: ["No workspace with id 999"],
    });
    expect(db.docs).toHaveLength(0);
  });

  it("answers 400 for a workspaceId below 100", async () => {
    const res = await createAs(ana, { ...VALID, workspaceId: 42 });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(["workspaceId must be at least 100"]);
  });

  it("answers 400 for a resourceType under 5 characters", async () => {
    const res = await createAs(ana, { ...VALID, resourceType: "vm" });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([
      "resourceType must be at least 5 characters long",
    ]);
  });

  it("answers 400 for a status outside the ProvisionStatus enum", async () => {
    const res = await createAs(ana, { ...VALID, status: 9 });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(["9 is not a valid ProvisionStatus"]);
  });

  it("answers 400 naming both required fields when the body is empty", async () => {
    const res = await createAs(ana, {});

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        "workspaceId is required",
        "resourceType is required",
      ]),
    );
    expect(db.docs).toHaveLength(0);
  });
});

describe("GET /api/provision-requests", () => {
  it("lists only the caller's own requests", async () => {
    await createAs(ana);
    await createAs(ana, { ...VALID, workspaceId: 104 });
    await createAs(ben);

    const res = await request(app)
      .get("/api/provision-requests")
      .set("Authorization", bearer(ana));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.every((r: { engineerId: string }) => r.engineerId === ana)).toBe(true);
  });

  it("puts the newest request first", async () => {
    for (const [workspaceId, day] of [[101, 1], [102, 3], [103, 2]]) {
      await ProvisionRequest.create({
        ...VALID,
        workspaceId,
        engineerId: ana,
        requestedAt: new Date(`2026-11-0${day}T00:00:00Z`),
      });
    }

    const res = await request(app)
      .get("/api/provision-requests")
      .set("Authorization", bearer(ana));

    expect(res.body.map((r: { workspaceId: number }) => r.workspaceId)).toEqual([
      102, 103, 101,
    ]);
  });

  it("answers [] for a user with no requests", async () => {
    await createAs(ben);

    const res = await request(app)
      .get("/api/provision-requests")
      .set("Authorization", bearer(ana));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("GET /api/provision-requests/:id", () => {
  it("returns the caller's own request", async () => {
    const { body: created } = await createAs(ana);

    const res = await request(app)
      .get(`/api/provision-requests/${created.id}`)
      .set("Authorization", bearer(ana));

    expect(res.status).toBe(200);
    expect(res.body).toEqual(created);
  });

  it("answers 404 (not 403) for someone else's request, so its existence is not revealed", async () => {
    const { body: bens } = await createAs(ben);

    const res = await request(app)
      .get(`/api/provision-requests/${bens.id}`)
      .set("Authorization", bearer(ana));

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("No provision request with that id");
  });

  it("answers 400 for an id that is not an ObjectId", async () => {
    const res = await request(app)
      .get("/api/provision-requests/not-an-id")
      .set("Authorization", bearer(ana));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('"not-an-id" is not a valid id');
  });
});

describe("PATCH /api/provision-requests/:id", () => {
  it("updates the caller's own request and returns the new version", async () => {
    const { body: created } = await createAs(ana);

    const res = await request(app)
      .patch(`/api/provision-requests/${created.id}`)
      .set("Authorization", bearer(ana))
      .send({ status: ProvisionStatus.Provisioning });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe(ProvisionStatus.Provisioning);
    expect(res.body.resourceType).toBe(VALID.resourceType);
  });

  it("runs the schema validators on updates too", async () => {
    const { body: created } = await createAs(ana);

    const res = await request(app)
      .patch(`/api/provision-requests/${created.id}`)
      .set("Authorization", bearer(ana))
      .send({ status: 9 });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(["9 is not a valid ProvisionStatus"]);
  });

  it("ignores engineerId: a request cannot be moved into another engineer's list", async () => {
    const { body: created } = await createAs(ana);

    const res = await request(app)
      .patch(`/api/provision-requests/${created.id}`)
      .set("Authorization", bearer(ana))
      .send({ engineerId: ben, status: ProvisionStatus.Provisioning });

    expect(res.status).toBe(200);
    expect(res.body.engineerId).toBe(ana);
    expect(String(db.docs[0].engineerId)).toBe(ana);

    const bensList = await request(app)
      .get("/api/provision-requests")
      .set("Authorization", bearer(ben));
    expect(bensList.body).toEqual([]);
  });

  it("ignores requestedAt: the original time is kept", async () => {
    const { body: created } = await createAs(ana);

    const res = await request(app)
      .patch(`/api/provision-requests/${created.id}`)
      .set("Authorization", bearer(ana))
      .send({ requestedAt: "2020-01-01T00:00:00.000Z" });

    expect(res.status).toBe(200);
    expect(res.body.requestedAt).toBe(created.requestedAt);
  });

  it("moves a request to another workspace that exists", async () => {
    const { body: created } = await createAs(ana);

    const res = await request(app)
      .patch(`/api/provision-requests/${created.id}`)
      .set("Authorization", bearer(ana))
      .send({ workspaceId: 104 });

    expect(res.status).toBe(200);
    expect(res.body.workspaceId).toBe(104);
  });

  it("answers 400 for a workspace that does not exist and leaves the request unchanged", async () => {
    const { body: created } = await createAs(ana);

    const res = await request(app)
      .patch(`/api/provision-requests/${created.id}`)
      .set("Authorization", bearer(ana))
      .send({ workspaceId: 999 });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(["No workspace with id 999"]);
    expect(db.docs[0].workspaceId).toBe(VALID.workspaceId);
  });

  it("answers 404 for someone else's request and leaves it unchanged", async () => {
    const { body: bens } = await createAs(ben);

    const res = await request(app)
      .patch(`/api/provision-requests/${bens.id}`)
      .set("Authorization", bearer(ana))
      .send({ status: ProvisionStatus.Terminated });

    expect(res.status).toBe(404);
    expect(db.docs[0].status).toBe(ProvisionStatus.PendingReview);
  });
});

describe("DELETE /api/provision-requests/:id", () => {
  it("deletes the caller's own request with 204 and no body", async () => {
    const { body: created } = await createAs(ana);

    const res = await request(app)
      .delete(`/api/provision-requests/${created.id}`)
      .set("Authorization", bearer(ana));

    expect(res.status).toBe(204);
    expect(res.text).toBe("");
    expect(db.docs).toHaveLength(0);
  });

  it("answers 404 the second time, because it is already gone", async () => {
    const { body: created } = await createAs(ana);
    const path = `/api/provision-requests/${created.id}`;

    await request(app).delete(path).set("Authorization", bearer(ana));
    const again = await request(app).delete(path).set("Authorization", bearer(ana));

    expect(again.status).toBe(404);
  });

  it("answers 404 for someone else's request and does not delete it", async () => {
    const { body: bens } = await createAs(ben);

    const res = await request(app)
      .delete(`/api/provision-requests/${bens.id}`)
      .set("Authorization", bearer(ana));

    expect(res.status).toBe(404);
    expect(db.docs).toHaveLength(1);
  });
});
