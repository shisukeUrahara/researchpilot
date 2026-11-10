import { expect, test } from "vitest";
import { STOP_REASONS } from "../domain/schemas";
import { assertOutcome, statusFor, transition } from "./status";

test("legal changes pass, illegal ones throw", () => {
  expect(transition("created", "running")).toBe("running");
  expect(transition("running", "awaiting_approval")).toBe("awaiting_approval");
  expect(transition("awaiting_approval", "running")).toBe("running");
  expect(() => transition("completed", "running")).toThrow(/illegal/);
  expect(() => transition("created", "completed")).toThrow(/illegal/);
});

test("every stop reason maps to one final status", () => {
  expect(STOP_REASONS.map(statusFor)).toEqual(["completed", "stopped", "stopped", "stopped", "stopped", "stopped", "cancelled", "failed"]);
});

test("a finished run has exactly one matching stop reason", () => {
  expect(() => assertOutcome("completed", "VERIFIED")).not.toThrow();
  expect(() => assertOutcome("stopped", "NO_PROGRESS")).not.toThrow();
  expect(() => assertOutcome("running", null)).not.toThrow();
  expect(() => assertOutcome("stopped", null)).toThrow(/no stop reason/);
  expect(() => assertOutcome("running", "TIMEOUT")).toThrow(/already has/);
  expect(() => assertOutcome("completed", "TIMEOUT")).toThrow(/does not lead/);
});
