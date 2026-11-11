import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Empty, Notice } from "../StateViews";
import { Card } from "./Card";
import { RangeBar } from "./charts";
import { Pill } from "./Pill";
import { SectionHeader } from "./SectionHeader";
import { StatTile } from "./StatTile";

test("Card names its section after the title", () => {
  render(<Card title="Noise floor">x</Card>);
  expect(screen.getByRole("region", { name: "Noise floor" })).toBeInTheDocument();
});

test("Pill, StatTile and SectionHeader render their text", () => {
  render(
    <>
      <Pill tone="waived">failed + waived</Pill>
      <StatTile value={30} label="caught" tone="success" />
      <SectionHeader title="Checks" hint="Grouped by tier" />
    </>,
  );
  expect(screen.getByText("failed + waived")).toHaveClass("border-dashed");
  expect(screen.getByText("30")).toHaveClass("text-success");
  expect(screen.getByRole("heading", { name: "Checks" })).toBeInTheDocument();
});

test("RangeBar says the point and range in words", () => {
  render(<RangeBar lo={0.886} hi={1} point={1} label="Canary recall" barClass="bg-success" />);
  expect(screen.getByRole("img")).toHaveAccessibleName("Canary recall: 100.0%, 95% range 88.6% to 100.0%");
});

test("Empty shows the exact command; Notice is a status", () => {
  render(
    <>
      <Empty title="No gated runs yet." command="pnpm ef run --split holdout --candidate prompt:B.v1" />
      <Notice>labels changed</Notice>
    </>,
  );
  expect(screen.getByText("pnpm ef run --split holdout --candidate prompt:B.v1")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("labels changed");
});
