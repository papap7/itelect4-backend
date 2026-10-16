import type { Types } from "mongoose";

export const enum EngineerRole {
  Developer = "developer",
  NetworkAdmin = "network_admin",
  DevOpsAdmin = "devops_admin",
}

export enum ProvisionStatus {
  PendingReview,
  Provisioning,
  Active,
  Failed,
  Terminated,
}

export interface Engineer {
  id: number;
  name: string;
  email: string;
  role: EngineerRole;
  isActive: boolean;
}

export interface ProjectWorkspace {
  id: number;
  title: string;
  description: string;
  createdAt: Date;
}

export interface ProvisionRequest {
  id: number;
  engineerId: number;
  workspaceId: number;
  resourceType: string;
  status: ProvisionStatus;
  requestedAt: Date;
}

export type EngineerDoc = Omit<Engineer, "id"> & {
  password: string;
};

export type ProvisionRequestDoc = Omit<ProvisionRequest, "id" | "engineerId"> & {
  engineerId: Types.ObjectId;
};

export type NewProvisionRequestBody = Pick<ProvisionRequest, "workspaceId" | "resourceType" | "status">;

// ProjectWorkspace is the one Session 1 interface whose numeric id we
// do NOT store in Mongo -- Mongo manages _id. Instead we keep a
// numeric workspaceId field (101-106) as the identity that
// ProvisionRequest already references. Omit+intersection produces a
// mapped type, not a raw interface, so the toJSON transform's
// Record<string, unknown> parameter type-checks cleanly.
export type WorkspaceDoc = Omit<ProjectWorkspace, "id"> & {
  workspaceId: number;
};
