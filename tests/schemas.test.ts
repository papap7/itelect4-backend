import { describe, it, expect } from "vitest";
import {
  aiRequestSchema,
  advisorSchema,
  advisorJsonSchema,
} from "../src/schemas/advisor";
import { EXAMPLES, SYSTEM_PROMPT, wrap } from "../src/ai/prompt";

const VALID_ADVICE = {
  summary: "You want one small VM.",
  suggestions: ["Name the OS."],
  risks: ["Unpatched images."],
  urgency: "low",
};

describe("aiRequestSchema (what a client may send to POST /api/ai)", () => {
  it("accepts exactly 20 characters and rejects 19", () => {
    expect(aiRequestSchema.safeParse({ prompt: "x".repeat(20) }).success).toBe(true);
    expect(aiRequestSchema.safeParse({ prompt: "x".repeat(19) }).success).toBe(false);
  });

  it("accepts exactly 2000 characters and rejects 2001", () => {
    expect(aiRequestSchema.safeParse({ prompt: "x".repeat(2000) }).success).toBe(true);
    expect(aiRequestSchema.safeParse({ prompt: "x".repeat(2001) }).success).toBe(false);
  });

  it("trims before measuring, so spaces cannot pad a short prompt past 20", () => {
    const result = aiRequestSchema.safeParse({ prompt: `${" ".repeat(30)}short` });

    expect(result.success).toBe(false);
  });

  it("hands the route the trimmed prompt", () => {
    const result = aiRequestSchema.parse({ prompt: "  I need a staging database please  " });

    expect(result.prompt).toBe("I need a staging database please");
  });

  it("rejects a prompt that is not a string", () => {
    expect(aiRequestSchema.safeParse({ prompt: 12345678901234567890 }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ prompt: ["a", "b"] }).success).toBe(false);
  });
});

describe("advisorSchema (what Gemini must send back)", () => {
  it("accepts a well-formed reply", () => {
    expect(advisorSchema.safeParse(VALID_ADVICE).success).toBe(true);
  });

  it("requires one to three suggestions", () => {
    expect(advisorSchema.safeParse({ ...VALID_ADVICE, suggestions: [] }).success).toBe(false);
    expect(
      advisorSchema.safeParse({ ...VALID_ADVICE, suggestions: ["a", "b", "c", "d"] }).success,
    ).toBe(false);
  });

  it("requires one to three risks", () => {
    expect(advisorSchema.safeParse({ ...VALID_ADVICE, risks: [] }).success).toBe(false);
    expect(
      advisorSchema.safeParse({ ...VALID_ADVICE, risks: ["a", "b", "c", "d"] }).success,
    ).toBe(false);
  });

  it("allows only critical, standard or low as urgency", () => {
    for (const urgency of ["critical", "standard", "low"]) {
      expect(advisorSchema.safeParse({ ...VALID_ADVICE, urgency }).success).toBe(true);
    }
    expect(advisorSchema.safeParse({ ...VALID_ADVICE, urgency: "urgent" }).success).toBe(false);
  });

  it("rejects a reply with a field missing", () => {
    const { summary: _summary, ...noSummary } = VALID_ADVICE;

    expect(advisorSchema.safeParse(noSummary).success).toBe(false);
  });

  it("becomes a JSON Schema that marks all four fields required", () => {
    expect(advisorJsonSchema.required).toEqual(
      expect.arrayContaining(["summary", "suggestions", "risks", "urgency"]),
    );
  });
});

describe("prompt.ts", () => {
  it("has worked examples whose advice passes the same schema Gemini must pass", () => {
    // TypeScript checks the examples' shape, but not array lengths: a
    // fourth suggestion still compiles. This catches it.
    expect(EXAMPLES.length).toBeGreaterThan(0);
    for (const example of EXAMPLES) {
      expect(advisorSchema.safeParse(example.advice).success).toBe(true);
    }
  });

  it("wraps the engineer's text in the tags the system prompt names", () => {
    expect(wrap("hello")).toBe("<provision-request>\nhello\n</provision-request>");
    expect(SYSTEM_PROMPT).toContain("<provision-request>");
  });

  it("tells the model to treat the tagged text as data, not instructions", () => {
    expect(SYSTEM_PROMPT).toMatch(/never instructions/i);
  });
});
