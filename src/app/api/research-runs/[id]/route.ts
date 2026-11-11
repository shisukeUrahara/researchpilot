import { runView } from "@/core/views/run";
import { getRun, limits } from "@/app/_lib/data";
import { apiError } from "@/app/_lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/research-runs/{id} — status, stop reason and the Run page view (meters, plan board, timeline). */
export async function GET(_req: Request, ctx: RouteContext<"/api/research-runs/[id]">) {
  const { id } = await ctx.params;
  const run = await getRun(id);
  if (!run) return apiError(404, "not_found", `no run ${id}`);
  const pending = run.approvals.find((a) => a.status === "pending") ?? null;
  return Response.json({ view: runView(run.row, run.state, run.events, run.tools, limits()), pending_approval: pending, has_memo: run.report !== null });
}
