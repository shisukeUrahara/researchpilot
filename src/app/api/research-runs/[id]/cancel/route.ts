import { openStore } from "@/core/store/db";
import { env } from "@/app/_lib/data";
import { apiError } from "@/app/_lib/api";

export const runtime = "nodejs";

/** POST /api/research-runs/{id}/cancel — the run stops with CANCELLED before its next step. */
export async function POST(_req: Request, ctx: RouteContext<"/api/research-runs/[id]/cancel">) {
  const { id } = await ctx.params;
  const store = openStore(env().stateDir);
  try {
    if (!store.getRun(id)) return apiError(404, "not_found", `no run ${id}`);
    store.requestCancel(id, new Date().toISOString());
    return Response.json({ run_id: id, cancel: "requested" }, { status: 202 });
  } finally {
    store.close();
  }
}
