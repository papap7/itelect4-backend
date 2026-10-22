import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import mongoose from "mongoose";
import { connectDB } from "./config/db";
import { authRouter } from "./routes/auth";
import { provisionRequestRouter } from "./routes/provisionRequest";
import { workspaceRouter } from "./routes/workspace";
import { aiRouter } from "./routes/ai";

// This file builds the app and stops. It never opens a port and never
// touches the database, so anything that wants an app -- server.ts, or
// a test -- can have one without starting a server.
export const app = express();

// ===== SESSION 9: one line, and every website on the internet was
//                  allowed to call this API =========================
// app.use(cors());
//
// NOTE: That was right for a laptop. Deployed, it means any page
//       anywhere can send a request with your user's token in it.
// ===== SESSION 10: only the origins this app is actually served from =

// One environment variable, comma-separated, so the list is different
// on your laptop and on Vercel without the code knowing which it is.
// Origins have no trailing slash: http://localhost:5173 not .../
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin !== "");

app.use(cors({ origin: ALLOWED_ORIGINS }));

// Reads a JSON request body and puts it on req.body. Without this
// line req.body is undefined, and `const { email } = req.body` throws.
app.use(express.json());

// ===== SESSION 10: the line that makes this work on Vercel ===========
// On your laptop, server.ts connects to MongoDB and only then starts
// listening, so a request cannot arrive before the connection exists.
// Deployed there is no server.ts step -- the app IS the function, and
// a request is the first thing that happens. So the waiting moves
// here, in front of every route.
app.use(async (_req: Request, _res: Response, next: NextFunction) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    // A connection failure is forwarded to the error handler below
    // so the request gets a 500 with a message instead of hanging.
    next(err);
  }
});

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true, db: mongoose.connection.readyState === 1 });
});

app.use("/api/auth", authRouter);
app.use("/api/workspaces", workspaceRouter);
app.use("/api/provision-requests", provisionRequestRouter);

// ===== SESSION 11: one more router, mounted like the other three ====
// Private, rate limited, and the only route that talks to Gemini.
app.use("/api/ai", aiRouter);

// 404 Handler
// Nothing above matched, so the URL does not exist. Without this, an
// unknown path returns Express's own HTML error page, which is a
// surprise for something that otherwise only ever speaks JSON.
app.use((req: Request, res: Response) => {
  res.status(404).json({
    message: `No route for ${req.method} ${req.originalUrl}`,
  });
});

// Error Handler
// Four parameters, not three. That is the only thing telling Express
// this function is the error handler -- and it is why `next` has to
// stay here even though nothing calls it.
app.use(
  (err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof mongoose.Error.ValidationError) {
      res.status(400).json({
        message: "Validation failed",
        errors: Object.values(err.errors).map((e) => e.message),
      });
      return;
    }

    if (err instanceof mongoose.Error.CastError) {
      res.status(400).json({
        message: `"${err.value}" is not a valid id`,
      });
      return;
    }

    console.error(err);
    res.status(500).json({ message: "Something went wrong" });
  },
);

// Vercel looks for an Express app in six places, and src/app.ts is one
// of them. What it needs there is a default export -- that is the
// whole of the deployment configuration for this project.
// Set maximum duration to 60s so Gemini calls (10-25s) do not trigger 504 timeouts.
export const config = {
  maxDuration: 60,
};

export default app;
