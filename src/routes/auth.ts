import { Router, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { Engineer } from "../models/Engineer";
import type { TokenPayload } from "../middleware/auth";
import { registerSchema, loginSchema, validationErrors } from "../schemas/auth";

export const authRouter = Router();

authRouter.post(
  "/register",
  async (req: Request, res: Response) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(validationErrors(parsed.error));
      return;
    }
    // Only these three fields are read, so a role or isActive sent in
    // the body never reaches the model.
    const { name, email, password } = parsed.data;

    if (await Engineer.findOne({ email })) {
      res.status(409).json({
        message: "That email is already registered",
      });
      return;
    }

    const engineer = await Engineer.create({ name, email, password });
    res.status(201).json(engineer.toJSON());
  },
);

authRouter.post(
  "/login",
  async (req: Request, res: Response) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(validationErrors(parsed.error));
      return;
    }
    const { email, password } = parsed.data;

    /**
     * Explicitly select the password field for verification since it is hidden by default.
     */
    const engineer = await Engineer.findOne({ email }).select("+password");

    if (!engineer || !(await bcrypt.compare(password, engineer.password))) {
      res.status(401).json({
        message: "Email or password is incorrect",
      });
      return;
    }

    const payload: TokenPayload = { userId: String(engineer._id) };
    const token = jwt.sign(payload, process.env.JWT_SECRET!, {
      expiresIn: "2h",
    });

    res.json({ token, user: engineer.toJSON() });
  },
);
