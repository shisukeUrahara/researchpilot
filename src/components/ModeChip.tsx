/** "replay · no key" or "live": whether this server can call the model. Server component. */
export function ModeChip() {
  const live = Boolean(process.env.OPENAI_API_KEY);
  return (
    <span className="hidden rounded-full border border-line bg-surface/70 px-3 py-1 font-mono text-xs text-muted sm:inline" title={live ? "Model calls allowed (OPENAI_API_KEY set)" : "Answers come from the committed replay cache only"}>
      {live ? "live" : "replay · no key"}
    </span>
  );
}
