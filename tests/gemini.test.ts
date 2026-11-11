import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApiError } from "@google/genai";
import { MODEL, SYSTEM_PROMPT, EXAMPLES } from "../src/ai/prompt";
import { advisorJsonSchema } from "../src/schemas/advisor";

// adviseRequest's only way out to Google is client.models.generateContent.
// Replace the client class with one whose generateContent is this mock;
// keep everything else (ApiError) real.
const { generateContent, GoogleGenAI } = vi.hoisted(() => {
  const generateContent = vi.fn();
  const GoogleGenAI = vi.fn(function () {
    return { models: { generateContent } };
  });
  return { generateContent, GoogleGenAI };
});

vi.mock("@google/genai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@google/genai")>()),
  GoogleGenAI,
}));

const ADVICE = {
  summary: "You want a Postgres database for the billing service.",
  suggestions: ["Pick a size.", "Say how long backups are kept."],
  risks: ["A public endpoint would expose customer data."],
  urgency: "critical",
};

const DESCRIPTION = "A managed Postgres database for billing, needed by Friday.";

function reply(text: string | undefined) {
  return { text };
}

// gemini.ts keeps the client in a module-level variable. A fresh copy of
// the module per test means each test starts with no client.
async function loadGemini() {
  vi.resetModules();
  return import("../src/ai/gemini");
}

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  generateContent.mockReset();
  GoogleGenAI.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("adviseRequest", () => {
  it("throws a clear sentence when GEMINI_API_KEY is missing", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const { adviseRequest } = await loadGemini();

    await expect(adviseRequest(DESCRIPTION)).rejects.toThrow(
      "GEMINI_API_KEY is missing. Add it to .env, and to Vercel.",
    );
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("returns the advice when Gemini's JSON matches the schema", async () => {
    generateContent.mockResolvedValue(reply(JSON.stringify(ADVICE)));
    const { adviseRequest } = await loadGemini();

    await expect(adviseRequest(DESCRIPTION)).resolves.toEqual(ADVICE);
  });

  it("sends the model, system prompt and JSON schema with every call", async () => {
    generateContent.mockResolvedValue(reply(JSON.stringify(ADVICE)));
    const { adviseRequest } = await loadGemini();

    await adviseRequest(DESCRIPTION);

    const [{ model, config }] = generateContent.mock.calls[0];
    expect(model).toBe(MODEL);
    expect(config.systemInstruction).toBe(SYSTEM_PROMPT);
    expect(config.responseMimeType).toBe("application/json");
    expect(config.responseJsonSchema).toEqual(advisorJsonSchema);
  });

  it("sends the examples as earlier turns and the description, tagged, last", async () => {
    generateContent.mockResolvedValue(reply(JSON.stringify(ADVICE)));
    const { adviseRequest } = await loadGemini();

    await adviseRequest(DESCRIPTION);

    const [{ contents }] = generateContent.mock.calls[0];
    expect(contents).toHaveLength(EXAMPLES.length * 2 + 1);
    expect(contents.map((c: { role: string }) => c.role)).toEqual([
      ...EXAMPLES.flatMap(() => ["user", "model"]),
      "user",
    ]);
    expect(contents.at(-1).parts[0].text).toBe(
      `<provision-request>\n${DESCRIPTION}\n</provision-request>`,
    );
  });

  it("makes the client once and reuses it", async () => {
    generateContent.mockResolvedValue(reply(JSON.stringify(ADVICE)));
    const { adviseRequest } = await loadGemini();

    await adviseRequest(DESCRIPTION);
    await adviseRequest(DESCRIPTION);

    expect(GoogleGenAI).toHaveBeenCalledTimes(1);
    expect(GoogleGenAI).toHaveBeenCalledWith({ apiKey: "test-key" });
  });

  it("retries once on the pinned model when the main one answers 503", async () => {
    generateContent
      .mockRejectedValueOnce(new ApiError({ message: "overloaded", status: 503 }))
      .mockResolvedValueOnce(reply(JSON.stringify(ADVICE)));
    const { adviseRequest } = await loadGemini();

    await expect(adviseRequest(DESCRIPTION)).resolves.toEqual(ADVICE);
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(generateContent.mock.calls[1][0].model).toBe("gemini-3.5-flash-lite-001");
  });

  it("does not retry other errors, such as a 429 quota error", async () => {
    generateContent.mockRejectedValue(new ApiError({ message: "quota", status: 429 }));
    const { adviseRequest } = await loadGemini();

    await expect(adviseRequest(DESCRIPTION)).rejects.toMatchObject({ status: 429 });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("throws AiReplyError when the reply has no text (e.g. safety-blocked)", async () => {
    generateContent.mockResolvedValue(reply(undefined));
    const { adviseRequest, AiReplyError } = await loadGemini();

    await expect(adviseRequest(DESCRIPTION)).rejects.toBeInstanceOf(AiReplyError);
  });

  it("throws AiReplyError when the reply is not JSON", async () => {
    generateContent.mockResolvedValue(reply("Sure! Here is my advice: ..."));
    const { adviseRequest, AiReplyError } = await loadGemini();

    await expect(adviseRequest(DESCRIPTION)).rejects.toThrow(AiReplyError);
  });

  it("throws AiReplyError when the JSON does not match the schema", async () => {
    generateContent.mockResolvedValue(
      reply(JSON.stringify({ ...ADVICE, urgency: "urgent" })),
    );
    const { adviseRequest, AiReplyError } = await loadGemini();

    await expect(adviseRequest(DESCRIPTION)).rejects.toThrow(
      new AiReplyError("Gemini's reply did not match the schema"),
    );
  });
});
