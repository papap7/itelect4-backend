import "dotenv/config";
import { adviseRequest } from "./ai/gemini";

// npm run try-ai. One real request to Gemini from your terminal --
// the same function POST /api/ai calls, with no Express, no token
// and no database. Run it once the key is in .env: if this prints a
// recommendation, the key, the model name and the schema all work.
async function tryAi() {
  const advice = await adviseRequest(
    "We need an AWS ElastiCache Redis cluster for session storage and " +
      "rate limiting across our microservices in production. Expected peak " +
      "throughput is 15,000 ops/sec.",
  );
  console.log(JSON.stringify(advice, null, 2));
}

tryAi().catch((err: unknown) => {
  console.error("Gemini call failed:", err);
  process.exit(1);
});
