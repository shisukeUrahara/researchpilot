import { redirect } from "next/navigation";
import { Empty } from "@/components/StateViews";
import { listRuns } from "@/app/_lib/data";

export const dynamic = "force-dynamic";

/** The Memo tab opens the latest run that has finished. */
export default function LatestMemo() {
  const done = listRuns(50).find((r) => r.stop_reason !== null);
  if (done) redirect(`/runs/${done.run_id}`);
  return <Empty title="No finished run yet. Start one on the Run page, or from the command line:" command="pnpm rp run --brief three-minute" />;
}
