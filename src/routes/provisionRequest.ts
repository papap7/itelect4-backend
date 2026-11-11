import { Router, type Request, type Response } from "express";
import { ProvisionRequest } from "../models/ProvisionRequest";
import { Workspace } from "../models/Workspace";
import { requireAuth } from "../middleware/auth";
import type { NewProvisionRequestBody } from "../types/index";

export const provisionRequestRouter = Router();

/**
 * Apply authentication middleware to all routes.
 */
provisionRequestRouter.use(requireAuth);

interface IdParam {
  id: string;
}

// The only fields a client may set on a provision request. Everything
// else is decided by the server: engineerId comes from the token,
// requestedAt from the clock, _id from MongoDB.
//
// This is an allowlist, not a blocklist. Passing req.body straight to
// create or findOneAndUpdate let a PATCH send { engineerId } and move
// the request into another engineer's list ("mass assignment"). A
// blocklist would have to be updated for every new server-owned field;
// an allowlist is safe by default.
const CLIENT_FIELDS = ["workspaceId", "resourceType", "status"] as const;

function clientFields(body: unknown): Partial<NewProvisionRequestBody> {
  const source = (body ?? {}) as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const field of CLIENT_FIELDS) {
    if (source[field] !== undefined) picked[field] = source[field];
  }
  return picked as Partial<NewProvisionRequestBody>;
}

// The schema can check that workspaceId is a number of at least 100,
// but not that a workspace with that id exists -- that needs a query.
// Without it, a request for workspace 999 was saved and pointed at
// nothing. Same 400 shape as a schema validation error.
async function rejectUnknownWorkspace(
  workspaceId: number,
  res: Response,
): Promise<boolean> {
  if (await Workspace.findOne({ workspaceId })) return false;

  res.status(400).json({
    message: "Validation failed",
    errors: [`No workspace with id ${workspaceId}`],
  });
  return true;
}

provisionRequestRouter.get("/", async (req: Request, res: Response) => {
  const requests = await ProvisionRequest.find({
    engineerId: req.userId,
  }).sort({ requestedAt: -1 });
  res.json(requests);
});

provisionRequestRouter.get(
  "/:id",
  async (req: Request<IdParam>, res: Response) => {
    const request = await ProvisionRequest.findOne({
      _id: req.params.id,
      engineerId: req.userId,
    });

    if (!request) {
      res.status(404).json({ message: "No provision request with that id" });
      return;
    }

    res.json(request);
  },
);

provisionRequestRouter.post("/", async (req: Request, res: Response) => {
  const request = new ProvisionRequest({
    ...clientFields(req.body),
    engineerId: req.userId,
  });

  // Schema rules first (a ValidationError goes to app.ts's handler as a
  // 400), so the workspace lookup below always has a valid number.
  await request.validate();

  if (await rejectUnknownWorkspace(request.workspaceId, res)) return;

  await request.save();
  res.status(201).json(request);
});

provisionRequestRouter.patch(
  "/:id",
  async (req: Request<IdParam>, res: Response) => {
    // Load only a request this engineer owns. Someone else's is a 404,
    // the same answer as one that does not exist.
    const request = await ProvisionRequest.findOne({
      _id: req.params.id,
      engineerId: req.userId,
    });

    if (!request) {
      res.status(404).json({ message: "No provision request with that id" });
      return;
    }

    const changes = clientFields(req.body);
    request.set(changes);
    await request.validate();

    if (
      changes.workspaceId !== undefined &&
      (await rejectUnknownWorkspace(request.workspaceId, res))
    ) {
      return;
    }

    // A body with nothing this route accepts ({ engineerId } alone)
    // changes nothing, so there is nothing to write.
    if (request.isModified()) await request.save();
    res.json(request);
  },
);

provisionRequestRouter.delete(
  "/:id",
  async (req: Request<IdParam>, res: Response) => {
    const request = await ProvisionRequest.findOneAndDelete({
      _id: req.params.id,
      engineerId: req.userId,
    });

    if (!request) {
      res.status(404).json({ message: "No provision request with that id" });
      return;
    }

    res.status(204).send();
  },
);
