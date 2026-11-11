import { redirect } from "next/navigation";
import { Empty } from "@/components/StateViews";
import { listRuns } from "@/app/_lib/data";

export const dynamic = "force-dynamic";

/** The Memo tab opens the latest run that has finished. */
export default function LatestMemo() {
  const done = listRuns(50).find((r) => r.stop_reason !== null);
  if (done) redirect(`/runs/${done.run_id}`);
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-medium tracking-tight">Decision memo</h1>
      <Empty title="No finished run yet. Start one on the Run page, or from the command line:" command="pnpm rp run --brief three-minute" />
    </div>
  );
}
