import { expect, test } from "vitest";
import { canonicalJson, sha256Hex } from "./canonical";

test("key order does not change the bytes; undefined is dropped", () => {
  expect(canonicalJson({ b: 1, a: [2, { d: 3, c: undefined }] })).toBe('{"a":[2,{"d":3}],"b":1}');
  expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
});

test("sha256 is hex and stable", () => {
  expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
