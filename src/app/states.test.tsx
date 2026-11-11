import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/" }));
import ErrorPage from "./error";
import Loading from "./loading";
import NotFound from "./not-found";
import { RunPanel } from "@/components/run/RunPanel";

test("error page: alert, the commands that fix data, a retry button", () => {
  const retry = vi.fn();
  render(<ErrorPage error={Object.assign(new Error("x"), { digest: "abc" })} retry={retry} />);
  expect(screen.getByRole("alert")).toHaveTextContent("pnpm rp rebuild-db");
  screen.getByRole("button", { name: "Try again" }).click();
  expect(retry).toHaveBeenCalled();
  expect(screen.getByText("error id abc")).toBeInTheDocument();
});

test("loading shows shapes only; not-found links back to the three pages", () => {
  render(<Loading />);
  expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  render(<NotFound />);
  expect(screen.getByRole("link", { name: "Evals" })).toHaveAttribute("href", "/evals");
});

const base = {
  runId: "run_1",
  arm: "bounded",
  policy: "strict",
  briefId: "golden-01",
  meters: [],
  plan: { planned: [], running: [], verified: [], blocked: [] },
  timeline: [],
  counts: { verified: 0, rejected: 0, unchecked: 0, conflicts: 0 },
  blockedAttempts: 0,
};

test.each([
  ["running", null, "RUNNING"],
  ["awaiting_approval", null, "AWAITING APPROVAL"],
  ["cancelled", "CANCELLED", "CANCELLED"],
  ["failed", "ERROR", "ERROR"],
])("run state %s shows %s", (status, stopReason, text) => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
  const view = { ...base, status, stopReason };
  render(<RunPanel runId="run_1" initial={{ view, pending_approval: status === "awaiting_approval" ? { approval_id: "apv_1", tool: "fetch_live", args_json: '{"url":"https://vercel.com/docs/functions/limitations"}', expires_at: "2026-11-11T10:15:00Z" } : null, has_memo: false }} />);
  expect(screen.getAllByTestId("stop-reason").at(-1)).toHaveTextContent(text);
  if (status === "awaiting_approval") expect(screen.getByText(/pnpm rp approve apv_1/)).toBeInTheDocument();
  vi.unstubAllGlobals();
});
