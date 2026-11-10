import { expect, test } from "vitest";
import { tokenize } from "./tokenize";

test("keeps compound identifiers whole and adds their parts (SearchLab behaviour)", () => {
  expect(tokenize("x-ratelimit-remaining")).toEqual(["x-ratelimit-remaining", "x", "ratelimit", "remaining"]);
  expect(tokenize("per_page=")).toEqual(["per_page=", "per", "page"]);
});

test("plain words are single tokens", () => {
  expect(tokenize("Add short-term memory")).toEqual(["add", "short-term", "short", "term", "memory"]);
});

test("camelCase and PascalCase names also match their parts", () => {
  expect(tokenize("InMemorySaver")).toEqual(["inmemorysaver", "in", "memory", "saver"]);
  expect(tokenize("use langgraph.checkpoint.PostgresSaver")).toEqual([
    "use",
    "langgraph.checkpoint.postgressaver",
    "langgraph", "checkpoint", "postgressaver",
    "postgres", "saver",
  ]);
});

test("snake_case identifiers keep the whole name", () => {
  expect(tokenize("thread_id")).toEqual(["thread_id", "thread", "id"]);
});
