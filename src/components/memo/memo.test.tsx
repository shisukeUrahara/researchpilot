import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import type { ClaimView } from "@/core/views/memo";
import { Claims } from "./Claims";
import { Ledger } from "./Ledger";

const ev = (source: string, date: string, kind: string, quote: string) => ({ quote, passageId: `${source}@x#y`, passageText: quote, source, url: "https://example.com", pageDate: date, dateKind: "page", kind, toolEvent: "req_1 · step 2 · search_docs" });
const claims: ClaimView[] = [
  { cell: "C02:vercel:hobby", value: "300 s", text: "Hobby max 300 s", evidence: ev("vc-limits", "2026-08-24", "docs", "| Hobby | 300s (5 minutes) |") },
  { cell: "C05:cloudflare:paid", value: "128 MB", text: "128 MB per isolate", evidence: ev("cf-limits", "2026-10-29", "docs", "| Memory | 128 MB | 128 MB |") },
];

test("selecting a number shows its quote, source, page date and tool event", () => {
  render(<Claims claims={claims} />);
  const panel = screen.getByTestId("evidence");
  expect(panel.querySelector("blockquote")).toHaveTextContent("| Hobby | 300s (5 minutes) |");
  fireEvent.click(screen.getByRole("button", { name: /C05:cloudflare:paid/ }));
  expect(within(screen.getByTestId("evidence")).getByText("cf-limits")).toBeInTheDocument();
  expect(within(screen.getByTestId("evidence")).getByText("req_1 · step 2 · search_docs")).toBeInTheDocument();
});

test("ledger shows a conflict as used vs superseded, and sorts facts", () => {
  render(
    <Ledger
      rows={[
        { id: "b", cell: "C02:vercel:hobby", value: "300 s", status: "verified", reason: null, source: "vc-limits", kind: "docs", date: "2026-08-24" },
        { id: "a", cell: "C02:vercel:hobby", value: "60 s", status: "verified", reason: null, source: "vc-limits-2025", kind: "archive", date: "2025-03-08" },
        { id: "c", cell: "C04:cloudflare:paid", value: "300 s", status: "rejected", reason: "criterion_mismatch", source: "cf-limits", kind: "docs", date: "2026-10-29" },
      ]}
      conflicts={[
        {
          cell: "C02:vercel:hobby",
          rule: "newest official kind wins",
          sides: [
            { factId: "b", value: "300 s", source: "vc-limits", kind: "docs", date: "2026-08-24", used: true },
            { factId: "a", value: "60 s", source: "vc-limits-2025", kind: "archive", date: "2025-03-08", used: false },
          ],
        },
      ]}
    />,
  );
  expect(screen.getByText("used")).toBeInTheDocument();
  expect(screen.getByText("superseded")).toBeInTheDocument();
  expect(screen.getByText("criterion_mismatch")).toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "date" } });
  const firstDate = screen.getAllByRole("row")[1];
  expect(firstDate).toHaveTextContent("2025-03-08");
});
