// Fresh copy of the committed data for browser tests, so a test run never writes into the real
// data or state folders. Replay only: the copy includes cache/llm, and no API key is set.
import { cpSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const root = path.resolve("e2e/.data");
rmSync(root, { recursive: true, force: true });
mkdirSync(path.join(root, "cache"), { recursive: true });
for (const p of ["config", "data", "fixtures", "gate", "runs", "pricing.json"]) cpSync(p, path.join(root, p), { recursive: true });
cpSync("cache/llm", path.join(root, "cache", "llm"), { recursive: true });
console.log(`e2e data copied to ${root}`);
