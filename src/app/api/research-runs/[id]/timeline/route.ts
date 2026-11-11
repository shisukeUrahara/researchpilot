import { getRun } from "@/app/_lib/data";
import { apiError } from "@/app/_lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/research-runs/{id}/timeline — every recorded event with its request id. */
export async function GET(_req: Request, ctx: RouteContext<"/api/research-runs/[id]/timeline">) {
  const { id } = await ctx.params;
  const run = await getRun(id);
  if (!run) return apiError(404, "not_found", `no run ${id}`);
  return Response.json({ run_id: id, events: run.events.map((e) => ({ ...e, detail: JSON.parse(e.detail_json), detail_json: undefined })) });
}
