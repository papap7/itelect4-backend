import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import mongoose from "mongoose";
import { connectDB } from "./config/db";
import { allowedOrigins } from "./config/cors";
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
// The parsing lives in config/cors.ts so it can be tested on its own,
// next to the patterns for the frontend's Vercel preview deployments.
const ALLOWED_ORIGINS = allowedOrigins(process.env.CORS_ORIGIN);

app.use(cors({ origin: ALLOWED_ORIGINS }));

// ===== Two frontend domains, one browser cache ======================
// cors() above answers each origin with its own Access-Control-Allow-
// Origin and adds Vary: Origin. That was not enough once the frontend
// had two domains. The browser stored the old domain's response, then
// on the new domain revalidated that stored copy with If-None-Match.
// The body had not changed, so Express answered 304 Not Modified with
// no body -- and the browser rebuilt the response from its stored copy,
// Access-Control-Allow-Origin for the OLD domain included. CORS failed.
//
// Two lines take that path away instead of depending on how a browser
// or Vercel's edge merges a 304 into a stored response:
//   - no ETag, so Express never answers 304;
//   - Cache-Control: no-store, so the browser keeps no copy to reuse.
// This API's responses are small, per-user or changing JSON; there was
// never a copy worth keeping. no-store is also what you want on any
// response that was sent because of an Authorization header.
app.set("etag", false);

app.use((_req: Request, res: Response, next: NextFunction) => {
  res.set("Cache-Control", "no-store");
  next();
});

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

    // express.json() reports a body it cannot read by throwing an error
    // that already carries a 4xx status: 400 for broken JSON, 413 for a
    // body over the size limit. Those are the client's mistake, so keep
    // the status instead of turning them into a 500 -- which also kept
    // them out of the error log, where a 500 means "bug in this app".
    const status = (err as { status?: unknown }).status;
    if (typeof status === "number" && status >= 400 && status < 500) {
      const type = (err as { type?: unknown }).type;
      res.status(status).json({
        message:
          type === "entity.parse.failed"
            ? "The request body is not valid JSON"
            : type === "entity.too.large"
              ? "The request body is too large"
              : "Bad request",
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
