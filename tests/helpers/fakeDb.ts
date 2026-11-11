import { vi } from "vitest";
import type { Model } from "mongoose";

// The tests run without MongoDB. Instead of mocking Workspace.find or
// Engineer.create (which would skip the code worth testing), this
// replaces only the last step: the MongoDB driver calls Mongoose makes
// on model.collection. Everything above that line is the real code --
// Mongoose casting ("abc" is not an ObjectId), schema validation,
// the password-hashing pre("save") hook, toJSON, and the Express routes.
//
// It understands exactly what this app's routes send: equality filters,
// a sort, and $set updates. Anything else throws, so a test can never
// pass because the fake quietly ignored part of a query.

type Raw = Record<string, unknown>;
type SortSpec = Record<string, 1 | -1>;

const ALLOWED_UPDATE_KEYS = new Set(["$set", "$setOnInsert"]);

function sameValue(a: unknown, b: unknown): boolean {
  // ObjectId, Number and String all compare by their string form, which
  // is how MongoDB's equality match behaves for the values used here.
  return String(a) === String(b);
}

function matches(doc: Raw, filter: Raw): boolean {
  return Object.entries(filter).every(([key, value]) => {
    if (value !== null && typeof value === "object" && !isIdLike(value)) {
      throw new Error(
        `fakeDb: unsupported filter for "${key}": ${JSON.stringify(value)}`,
      );
    }
    return sameValue(doc[key], value);
  });
}

function isIdLike(value: object): boolean {
  return value.constructor?.name === "ObjectId" || value instanceof Date;
}

function sortDocs(docs: Raw[], sort?: SortSpec): Raw[] {
  if (!sort) return docs;
  const [[field, direction]] = Object.entries(sort);
  return [...docs].sort((a, b) => {
    const x = a[field] as number | Date;
    const y = b[field] as number | Date;
    return (x < y ? -1 : x > y ? 1 : 0) * direction;
  });
}

// Mongoose turns `select: false` (Engineer.password) into an exclusion
// projection such as { password: 0 }, and select("+password") removes
// it. Only exclusions are supported, because only exclusions happen here.
function project(doc: Raw, projection?: Record<string, unknown>): Raw {
  const copy = { ...doc };
  for (const [key, value] of Object.entries(projection ?? {})) {
    if (value === 0 || value === false) {
      delete copy[key];
    } else {
      throw new Error(`fakeDb: unsupported projection ${key}: ${String(value)}`);
    }
  }
  return copy;
}

export interface FakeCollection {
  /** The raw documents "in the database" right now. */
  docs: Raw[];
}

export function fakeCollection(model: Model<any>): FakeCollection {
  const state: FakeCollection = { docs: [] };
  const coll = model.collection as unknown as Record<string, unknown>;

  vi.spyOn(coll as any, "insertOne").mockImplementation(async (doc: any) => {
    state.docs.push({ ...doc });
    return { acknowledged: true, insertedId: doc._id };
  });

  vi.spyOn(coll as any, "findOne").mockImplementation(
    async (filter: any, options: any) => {
      const found = state.docs.find((d) => matches(d, filter));
      return found ? project(found, options?.projection) : null;
    },
  );

  vi.spyOn(coll as any, "find").mockImplementation((filter: any, options: any) => ({
    toArray: async () =>
      sortDocs(
        state.docs.filter((d) => matches(d, filter ?? {})),
        options?.sort,
      ).map((d) => project(d, options?.projection)),
  }));

  vi.spyOn(coll as any, "findOneAndUpdate").mockImplementation(
    async (filter: any, update: any, options: any) => {
      const index = state.docs.findIndex((d) => matches(d, filter));
      if (index === -1) return null;

      for (const key of Object.keys(update)) {
        if (!ALLOWED_UPDATE_KEYS.has(key)) {
          throw new Error(`fakeDb: unsupported update operator ${key}`);
        }
      }

      const before = state.docs[index];
      const after = { ...before, ...(update.$set ?? {}) };
      state.docs[index] = after;
      return { ...(options?.returnDocument === "after" ? after : before) };
    },
  );

  // doc.save() on a document that already exists sends updateOne.
  vi.spyOn(coll as any, "updateOne").mockImplementation(
    async (filter: any, update: any) => {
      const index = state.docs.findIndex((d) => matches(d, filter));
      if (index === -1) {
        return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
      }
      for (const key of Object.keys(update)) {
        if (!ALLOWED_UPDATE_KEYS.has(key)) {
          throw new Error(`fakeDb: unsupported update operator ${key}`);
        }
      }
      state.docs[index] = { ...state.docs[index], ...(update.$set ?? {}) };
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    },
  );

  vi.spyOn(coll as any, "findOneAndDelete").mockImplementation(
    async (filter: any) => {
      const index = state.docs.findIndex((d) => matches(d, filter));
      if (index === -1) return null;
      const [removed] = state.docs.splice(index, 1);
      return { ...removed };
    },
  );

  return state;
}
