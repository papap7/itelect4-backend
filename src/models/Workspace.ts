import { Schema, model } from "mongoose";
import { type WorkspaceDoc } from "../types/index";

// The third Session 1 interface, written as a Mongoose schema.
// ProjectWorkspace is the reference data behind the dropdown in the
// ProvisionRequest form -- nobody creates a workspace through the API,
// so there is no POST route and no requireAuth in the routes file.
const workspaceSchema = new Schema<WorkspaceDoc>({
  // Numeric identity (101-106). unique here is the reason
  // GET /api/workspaces/101 can use findOne and be certain it matched
  // exactly one document.
  workspaceId: {
    type: Number,
    required: [true, "workspaceId is required"],
    unique: true,
    min: [101, "workspaceId must be at least 101"],
  },

  title: {
    type: String,
    required: [true, "title is required"],
    trim: true,
  },

  description: {
    type: String,
    required: [true, "description is required"],
    trim: true,
  },

  // The Session 1 interface says Date; we store it properly so
  // Mongo can sort and compare it, not as a plain string.
  createdAt: {
    type: Date,
    required: [true, "createdAt is required"],
  },
});

// The frontend reads ws.id (string) off every workspace object.
// workspaceId is the numeric identity, so we expose it as id and
// strip the two fields Mongo added that the client never needs.
workspaceSchema.set("toJSON", {
  transform(_doc, ret: Record<string, unknown>) {
    ret.id = String(ret.workspaceId);
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const Workspace = model<WorkspaceDoc>("Workspace", workspaceSchema);
