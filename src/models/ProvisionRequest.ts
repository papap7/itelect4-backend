import { Schema, model } from "mongoose";
import { ProvisionStatus, type ProvisionRequestDoc } from "../types/index";

const provisionRequestSchema = new Schema<ProvisionRequestDoc>({
  engineerId: {
    type: Schema.Types.ObjectId,
    ref: "Engineer",
    required: true,
  },
  
  workspaceId: { 
    type: Number, 
    required: [true, "workspaceId is required"],
    min: [100, "workspaceId must be at least 100"] 
  },

  resourceType: {
    type: String,
    required: [true, "resourceType is required"],
    minlength: [5, "resourceType must be at least 5 characters long"],
    trim: true,
  },

  status: {
    type: Number,
    enum: {
      values: [
        ProvisionStatus.PendingReview, 
        ProvisionStatus.Provisioning, 
        ProvisionStatus.Active, 
        ProvisionStatus.Failed, 
        ProvisionStatus.Terminated
      ],
      message: "{VALUE} is not a valid ProvisionStatus"
    },
    default: ProvisionStatus.PendingReview,
  },

  requestedAt: { type: Date, default: Date.now },
});

/**
 * JSON serialization transform to map _id to id and exclude internal versioning.
 */
provisionRequestSchema.set("toJSON", {
  transform(_doc, ret: Record<string, unknown>) {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const ProvisionRequest = model<ProvisionRequestDoc>("ProvisionRequest", provisionRequestSchema);
