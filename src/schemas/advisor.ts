import { z } from "zod";

// What a client is allowed to send to POST /api/ai. Checked before
// anything is sent to Gemini, because every request that reaches
// Gemini is counted against your free quota -- a request that was
// never going to work should cost nothing.
export const aiRequestSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(20, "Describe your resource needs in at least 20 characters.")
    .max(2000, "Keep the description under 2000 characters."),
});

// What Gemini has to send BACK. This one schema is used three ways:
//   1. z.infer below turns it into the Advisor type for TypeScript.
//   2. z.toJSONSchema at the bottom turns it into the JSON Schema
//      that is sent to Gemini with every request.
//   3. advisorSchema.safeParse in src/ai/gemini.ts checks the reply.
// .describe() is not a comment: the text travels to Gemini inside
// the JSON Schema and tells the model what each field is for.
export const advisorSchema = z.object({
  summary: z
    .string()
    .describe("One sentence restating what the engineer is requesting."),
  suggestions: z
    .array(z.string())
    .min(1)
    .max(3)
    .describe("Concrete improvements to the provision request before submitting."),
  risks: z
    .array(z.string())
    .min(1)
    .max(3)
    .describe("Potential risks or issues to watch with this resource."),
  urgency: z
    .enum(["critical", "standard", "low"])
    .describe("How urgently the resource should be provisioned."),
});

export type Advisor = z.infer<typeof advisorSchema>;

// Computed once, when this file is first imported -- not per request.
export const advisorJsonSchema = z.toJSONSchema(advisorSchema);
