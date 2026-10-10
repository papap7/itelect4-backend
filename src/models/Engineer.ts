import { Schema, model } from "mongoose";
import bcrypt from "bcryptjs";
import { EngineerRole, type EngineerDoc } from "../types/index";

const engineerSchema = new Schema<EngineerDoc>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    role: {
      type: String,
      enum: [EngineerRole.Developer, EngineerRole.NetworkAdmin, EngineerRole.DevOpsAdmin],
      default: EngineerRole.Developer,
    },
    isActive: { type: Boolean, default: true },
    password: { type: String, required: true, minlength: 8, select: false },
  },
  { timestamps: true }
);

/**
 * Pre-save hook to generate a secure password hash.
 */
engineerSchema.pre("save", async function (this: any) {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

/**
 * JSON serialization transform to map _id to id and exclude sensitive fields.
 */
engineerSchema.set("toJSON", {
  transform(_doc, ret: Record<string, unknown>) {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    delete ret.password;
    return ret;
  },
});

export const Engineer = model<EngineerDoc>("Engineer", engineerSchema);