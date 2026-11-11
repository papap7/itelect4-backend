import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import mongoose from "mongoose";

// connectDB keeps its promise in a module-level variable. A fresh copy
// of the module per test means each test starts with no connection.
async function loadDb() {
  vi.resetModules();
  return import("../src/config/db");
}

let connect: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("MONGODB_URI", "mongodb://test-host/cloudops");
  connect = vi.spyOn(mongoose, "connect");
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("connectDB", () => {
  it("throws a sentence about .env when MONGODB_URI is missing", async () => {
    vi.stubEnv("MONGODB_URI", "");
    const { connectDB } = await loadDb();

    expect(() => connectDB()).toThrow(
      "MONGODB_URI is missing. Copy .env.example to .env and fill it in.",
    );
    expect(connect).not.toHaveBeenCalled();
  });

  it("connects with a 5 second server-selection timeout", async () => {
    connect.mockResolvedValue(mongoose);
    const { connectDB } = await loadDb();

    await connectDB();

    expect(connect).toHaveBeenCalledWith("mongodb://test-host/cloudops", {
      serverSelectionTimeoutMS: 5000,
    });
  });

  it("gives concurrent callers the same promise and connects only once", async () => {
    connect.mockResolvedValue(mongoose);
    const { connectDB } = await loadDb();

    const first = connectDB();
    const second = connectDB();
    await Promise.all([first, second]);

    expect(first).toBe(second);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("reuses the connection on later requests", async () => {
    connect.mockResolvedValue(mongoose);
    const { connectDB } = await loadDb();

    await connectDB();
    await connectDB();
    await connectDB();

    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("does not keep a failed attempt: the next call tries again", async () => {
    connect
      .mockRejectedValueOnce(new Error("Atlas unreachable"))
      .mockResolvedValueOnce(mongoose);
    const { connectDB } = await loadDb();

    await expect(connectDB()).rejects.toThrow("Atlas unreachable");
    await expect(connectDB()).resolves.toBe(mongoose);
    expect(connect).toHaveBeenCalledTimes(2);
  });
});
