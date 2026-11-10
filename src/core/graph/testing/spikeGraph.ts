import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

export const SpikeState = Annotation.Root({
  log: Annotation<string[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
});

/** a → b → c; `onEnter` runs at the top of every node, so tests can count (re-)runs or crash. */
export function spikeGraph(onEnter: (node: string) => void) {
  const node = (name: string) => async () => {
    onEnter(name);
    return { log: [name] };
  };
  return new StateGraph(SpikeState)
    .addNode("a", node("a"))
    .addNode("b", node("b"))
    .addNode("c", node("c"))
    .addEdge(START, "a")
    .addEdge("a", "b")
    .addEdge("b", "c")
    .addEdge("c", END);
}
