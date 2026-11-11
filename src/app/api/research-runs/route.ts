import { z } from "zod";
import { apiError } from "@/app/_lib/api";
import { listRuns, SAMPLES } from "@/app/_lib/data";
import { startSample } from "@/app/_lib/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Start = z.object({
  scenario_id: z.enum(SAMPLES.map((s) => s.id) as [string, ...string[]]),
  arm: z.enum(["bounded", "ablation", "naive"]).default("bounded"),
});

/** POST /api/research-runs — start a sample run. Body: { scenario_id, arm? }. */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError(400, "bad_json", "body is not JSON");
  }
  const parsed = Start.safeParse(body);
  if (!parsed.success) return apiError(400, "bad_request", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const runId = startSample(parsed.data.scenario_id, parsed.data.arm);
  return Response.json({ run_id: runId }, { status: 202 });
}

/** GET /api/research-runs — the latest runs. */
export async function GET() {
  return Response.json({ runs: listRuns(30) });
}
