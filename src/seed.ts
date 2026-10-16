import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "./config/db";
import { Workspace } from "./models/Workspace";
import { WORKSPACES } from "./data/workspaces";

// npm run seed. Run it once after the database is created, and again
// after anything that empties it. Nothing else in the project writes
// a workspace.
async function seed() {
  await connectDB();

  for (const workspace of WORKSPACES) {
    // upsert: update the row with this workspaceId, or insert it if
    // there is none. Running this a second time leaves six workspaces,
    // not twelve.
    await Workspace.updateOne(
      { workspaceId: workspace.workspaceId },
      workspace,
      { upsert: true },
    );
  }

  console.log(
    `${WORKSPACES.length} workspaces in ${mongoose.connection.name}`,
  );

  // Without this the script never ends: the connection is an open
  // socket, and Node keeps running while one is still open.
  await mongoose.disconnect();
}

seed().catch((err: unknown) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
