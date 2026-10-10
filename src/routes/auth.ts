import { Router, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { Engineer } from "../models/Engineer";
import type { TokenPayload } from "../middleware/auth";

export const authRouter = Router();

interface RegisterBody {
  name: string;
  email: string;
  password: string;
}

interface LoginBody {
  email: string;
  password: string;
}

authRouter.post(
  "/register",
  async (
    req: Request<unknown, unknown, RegisterBody>,
    res: Response,
  ) => {
    const { name, email, password } = req.body;

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
  async (
    req: Request<unknown, unknown, LoginBody>,
    res: Response,
  ) => {
    const { email, password } = req.body;

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
