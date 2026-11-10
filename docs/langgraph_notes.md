# LangGraph notes

Pinned by `src/core/graph/spike.test.ts` against `@langchain/langgraph` 1.7.2 and
`@langchain/langgraph-checkpoint-sqlite` 1.1.0 (uses `better-sqlite3`). If an upgrade changes any of
this, the spike fails first.

1. **`interrupt()` pauses; `new Command({ resume: value })` continues.** The first `invoke` returns
   the interrupt payload under `__interrupt__`, and `getState().next` names the paused node.
2. **An interrupted node re-runs from its first line on resume.** Anything before `interrupt()` runs
   twice. So the agent has a separate `approve` node that does nothing before `interrupt()`, and
   every write to the app DB is insert-or-ignore on a natural key.
3. **Checkpoint durability matters for crashes.** With `durability: "sync"`, a process killed with
   SIGKILL inside node `b` resumes at `b`: node `a` is not run again. With `durability: "exit"`, the
   same kill loses all progress. The default is `"async"` (saved while the next step runs), so a hard
   kill can lose the last step. ResearchPilot always passes `durability: "sync"`.
4. **`recursionLimit` throws `GraphRecursionError`.** It is only a backstop: our own step and tool
   budgets stop runs well before it.
5. **An `AbortSignal` passed to `invoke` stops a running graph** with an `AbortError`-like error. User
   cancel uses this, together with the Gateway's own signal.
6. **`durability: "sync"` writes one checkpoint per step** (input, start, then one per node).
7. **OpenAI strict mode accepts the `Proposal` schema** with the full tool list, decoy `send_email`
   included (one recorded live call, in `cache/llm/`). So the model *can* propose the decoy, and the
   injection test measures something real; only the executor blocks it.

8. **A node name may not equal a state field name.** `addNode("plan")` next to a `plan` field throws "plan is already being used as a state attribute". The planner node is called `planner`.

Packages: `pnpm-workspace.yaml` overrides `@langchain/langgraph` to 1.7.2, because `langchain` 1.6.1
asks for `^1.4.18` and a fresh install would otherwise take a same-day release next to our pin.
`pnpm why @langchain/langgraph` shows one copy.

Gotcha found while writing the spike: a `.ts` child script run with `node --import tsx` cannot use
top-level `await` (tsx compiles it as CommonJS here).
