import { z } from "zod";

// The shape of a request body, checked before it reaches Mongoose or
// bcrypt. Two reasons, both seen in tests before this file existed:
//
//   - bcrypt.compare throws when the password is not a string, so a
//     login with { email } and no password answered 500.
//   - req.body is whatever JSON the client sent. { "email": { "$ne": null } }
//     is valid JSON, and passed straight to findOne it is a MongoDB
//     query operator, not an email. Requiring a string closes that.
//
// The schemas check types only. The rules about values (minimum
// password length, lowercased email) stay in models/Engineer.ts, the
// one place that applies them however an engineer is saved.

function requiredString(field: string) {
  return z.string({
    error: (issue) =>
      issue.input === undefined
        ? `${field} is required`
        : `${field} must be a string`,
  });
}

export const registerSchema = z.object({
  name: requiredString("name"),
  email: requiredString("email"),
  password: requiredString("password"),
});

export const loginSchema = z.object({
  email: requiredString("email"),
  password: requiredString("password"),
});

// Same response shape as POST /api/ai and the Mongoose ValidationError
// branch in app.ts, so the frontend reads every 400 the same way.
export function validationErrors(error: z.ZodError) {
  return {
    message: "Validation failed",
    errors: error.issues.map((issue) => issue.message),
  };
}
