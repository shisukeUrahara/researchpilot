import { z } from "zod";
import { ApprovalError, decide } from "@/core/approvals/approvals";
import { ForbiddenError } from "@/core/auth/token";
import { openStore } from "@/core/store/db";
import { env } from "@/app/_lib/data";
import { resumeRun } from "@/app/_lib/runner";
import { apiError } from "@/app/_lib/api";

export const runtime = "nodejs";

const Body = z.object({ approval_id: z.string().min(4), decision: z.enum(["approved", "denied"]) });

/**
 * POST /api/research-runs/{id}/approve — the approver approves or denies one exact pending action.
 * Needs `Authorization: Bearer <RP_APPROVER_TOKEN>`. The run then continues in the background.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/research-runs/[id]/approve">) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "bad_request", "need { approval_id, decision: approved | denied }");
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  const store = openStore(env().stateDir);
  try {
    const a = store.getApproval(parsed.data.approval_id);
    if (!a || a.run_id !== id) return apiError(404, "not_found", "no such approval for this run");
    decide(store, a.approval_id, parsed.data.decision, token, env().approverToken, new Date());
  } catch (e) {
    if (e instanceof ForbiddenError) return apiError(403, "forbidden", e.message);
    if (e instanceof ApprovalError) return apiError(409, "conflict", e.message);
    throw e;
  } finally {
    store.close();
  }
  resumeRun(id);
  return Response.json({ run_id: id, decision: parsed.data.decision }, { status: 202 });
}
