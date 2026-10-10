import { Router, type Request, type Response } from "express";
import { ProvisionRequest } from "../models/ProvisionRequest";
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

provisionRequestRouter.post(
  "/",
  async (
    req: Request<unknown, unknown, NewProvisionRequestBody>,
    res: Response,
  ) => {
    const request = await ProvisionRequest.create({
      ...req.body,
      engineerId: req.userId,
    });

    res.status(201).json(request);
  },
);

provisionRequestRouter.patch(
  "/:id",
  async (
    req: Request<IdParam, unknown, Partial<NewProvisionRequestBody>>,
    res: Response,
  ) => {
    const request = await ProvisionRequest.findOneAndUpdate(
      { _id: req.params.id, engineerId: req.userId },
      req.body,
      { returnDocument: "after", runValidators: true },
    );

    if (!request) {
      res.status(404).json({ message: "No provision request with that id" });
      return;
    }

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
