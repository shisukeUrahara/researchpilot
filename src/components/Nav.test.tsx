import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/evals", useRouter: () => ({ refresh: () => {} }) }));
import { isActive } from "./links";
import { Nav } from "./Nav";

test("marks the current page in both navs", () => {
  render(<Nav />);
  const current = screen.getAllByRole("link", { current: "page" });
  expect(current.map((a) => a.textContent)).toEqual(["Evals", "Evals"]);
  expect(screen.getByRole("link", { name: "ResearchPilot" })).toHaveAttribute("href", "/");
});

test("Run is only active on the home page; a run's memo page lights up Memo", () => {
  expect(isActive("/", "/")).toBe(true);
  expect(isActive("/evals", "/")).toBe(false);
  expect(isActive("/runs/run_1", "/memo")).toBe(true);
});
