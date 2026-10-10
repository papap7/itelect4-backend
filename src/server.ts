import "dotenv/config";
import { app } from "./app";
import { connectDB } from "./config/db";

const PORT = Number(process.env.PORT) || 4000;

connectDB()
  .then(() => {
    app.listen(PORT, () =>
      console.log(`API on http://localhost:${PORT}`),
    );
  })
  .catch((err: unknown) => {
    console.error("Could not start:", err);
    process.exit(1);
  });
