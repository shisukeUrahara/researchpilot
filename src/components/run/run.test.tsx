import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { RunView } from "@/core/views/run";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { RunPanel } from "./RunPanel";
import { StartForm } from "./StartForm";

const view: RunView = {
  runId: "run_1",
  arm: "bounded",
  policy: "strict",
  briefId: "three-minute",
  status: "stopped",
  stopReason: "NO_PROGRESS",
  meters: [{ label: "Steps", used: 13, max: 16, tone: "near", text: "13 / 16" }],
  plan: { planned: [], running: [], verified: [{ id: "s1", task: "Vercel durations", open: [], done: ["C02:vercel:hobby"] }], blocked: [{ id: "s2", task: "Lambda", open: ["C02:aws:default"], done: [] }] },
  timeline: [{ key: "2-execute-0", ms: 6000, step: 2, node: "execute", kind: "tool_not_allowed", tool: "send_email", detail: "Blocked by executor: send_email is not on this run's allowlist", tone: "danger" }],
  counts: { verified: 9, rejected: 2, unchecked: 0, conflicts: 1 },
  blockedAttempts: 1,
};
const payload = { view, pending_approval: null, has_memo: true };
afterEach(() => vi.unstubAllGlobals());

test("run panel: stop reason, plan board columns, the blocked decoy row and the memo link", () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload))));
  render(<RunPanel runId="run_1" initial={payload} />);
  expect(screen.getByTestId("stop-reason")).toHaveTextContent("NO_PROGRESS");
  for (const col of ["planned · 0", "running · 0", "verified · 1", "blocked · 1"]) expect(screen.getByText(col)).toBeInTheDocument();
  expect(screen.getByText(/Blocked by executor: send_email/)).toBeInTheDocument();
  expect(screen.getByText("1 blocked by executor")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open memo" })).toHaveAttribute("href", "/runs/run_1");
  expect(screen.getByRole("meter", { name: "Steps" })).toHaveAttribute("aria-valuenow", "13");
});

test("start form: sample chips and arms are radio inputs; replay mode says what needs a key", () => {
  render(<StartForm samples={[{ id: "golden-01", label: "Three-minute job", question: "q", workload: "w", twist: null }]} live={false} />);
  expect(screen.getByRole("radio", { name: "Three-minute job" })).toBeChecked();
  expect(screen.getByRole("radio", { name: /naive/ })).not.toBeChecked();
  expect(screen.getByText(/Editing a brief needs live mode/)).toBeInTheDocument();
});
