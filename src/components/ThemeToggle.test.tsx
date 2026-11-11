import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { ThemeProvider } from "./ThemeProvider";
import { ThemeToggle } from "./ThemeToggle";

test("the toggle switches the html class between light and dark", () => {
  render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );
  const button = screen.getByRole("button", { name: "Toggle dark mode" });
  const before = document.documentElement.classList.contains("dark");
  fireEvent.click(button);
  expect(document.documentElement.classList.contains("dark")).toBe(!before);
  fireEvent.click(button);
  expect(document.documentElement.classList.contains("dark")).toBe(before);
});
