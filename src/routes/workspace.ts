import { Router, type Request, type Response } from "express";
import { Workspace } from "../models/Workspace";

export const workspaceRouter = Router();

// There is no requireAuth line in this file, and that is the point.
// provisionRequest.ts puts one at the top so every route below it is
// private; the workspace list is what populates the dropdown before
// the request form is submitted, so these two are public on purpose.

// GET /api/workspaces
workspaceRouter.get("/", async (_req: Request, res: Response) => {
  const workspaces = await Workspace.find().sort({ workspaceId: 1 });
  res.json(workspaces);
});

// Parameter shape for the single-workspace route
interface WorkspaceIdParam {
  workspaceId: string;
}

// GET /api/workspaces/:workspaceId
workspaceRouter.get(
  "/:workspaceId",
  async (req: Request<WorkspaceIdParam>, res: Response) => {
    // The param comes in as a string; coerce it to Number before
    // querying so "101" matches the Number field in the schema.
    const id = Number(req.params.workspaceId);

    const workspace = await Workspace.findOne({ workspaceId: id });

    if (!workspace) {
      res.status(404).json({
        message: `No workspace with id "${req.params.workspaceId}"`,
      });
      return;
    }

    res.json(workspace);
  },
);
