import jwt from "jsonwebtoken";
import mongoose from "mongoose";

// Signs a token the same way POST /api/auth/login does. requireAuth only
// checks the signature, so no matching user record is needed.
export function tokenFor(userId: string, expiresIn: jwt.SignOptions["expiresIn"] = "5m"): string {
  return jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn });
}

// A fresh ObjectId string, for routes that store the token's userId
// in an ObjectId field (provision requests' engineerId).
export function newUserId(): string {
  return new mongoose.Types.ObjectId().toHexString();
}

export function bearer(userId: string): string {
  return `Bearer ${tokenFor(userId)}`;
}
