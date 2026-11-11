import { memoMarkdown, memoView } from "@/core/views/memo";
import { getRun, manifest, passagesWithNotes } from "@/app/_lib/data";
import { apiError } from "@/app/_lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/research-runs/{id}/report — the checked memo with its evidence, as a Markdown download. */
export async function GET(_req: Request, ctx: RouteContext<"/api/research-runs/[id]/report">) {
  const { id } = await ctx.params;
  const run = await getRun(id);
  if (!run || !run.state || !run.report) return apiError(404, "not_found", `no memo for run ${id}`);
  const md = memoMarkdown(id, memoView(run.state, JSON.parse(run.report.memo_json), manifest(), passagesWithNotes(), run.tools));
  return new Response(md, { headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="memo-${id}.md"` } });
}
