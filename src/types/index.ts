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
