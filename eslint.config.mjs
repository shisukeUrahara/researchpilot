import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const noUi = [
  { group: ["next", "next/*", "react", "react/*", "react-dom", "react-dom/*"], message: "src/core must not import next or react." },
  { group: ["@/app", "@/app/*", "@/components", "@/components/*"], message: "src/core must not import UI code." },
];
const noLangChain = {
  group: ["langchain", "langchain/*", "@langchain/*"],
  message: "Only src/core/llm/ and src/core/graph/ may import LangChain or LangGraph.",
};
const lcFolders = ["src/core/llm/**", "src/core/graph/**"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // src/core is pure logic: no framework, no UI, and no LangChain outside the llm and graph folders.
  { files: ["src/core/**/*.{ts,tsx}"], ignores: lcFolders, rules: { "no-restricted-imports": ["error", { patterns: [...noUi, noLangChain] }] } },
  { files: lcFolders.map((f) => `${f}/*.{ts,tsx}`), rules: { "no-restricted-imports": ["error", { patterns: noUi }] } },
  { files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}", "src/cli/**/*.{ts,tsx}", "e2e/**/*.ts"], rules: { "no-restricted-imports": ["error", { patterns: [noLangChain] }] } },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "design/**"]),
]);

export default eslintConfig;
