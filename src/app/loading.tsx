/** Shown while a page reads the run folders. Shapes only; no numbers. */
export default function Loading() {
  const block = "rounded-[20px] border border-line bg-surface/70 motion-safe:animate-pulse";
  return (
    <div role="status" aria-label="Loading" className="space-y-6">
      <div className="h-5 w-full max-w-3xl rounded-lg bg-surface-2 motion-safe:animate-pulse" />
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <div className={`h-12 ${block}`} />
          <div className={`h-36 ${block}`} />
          <div className={`h-96 ${block}`} />
        </div>
        <div className="space-y-6 lg:col-span-4">
          <div className={`h-32 ${block}`} />
          <div className={`h-72 ${block}`} />
        </div>
      </div>
    </div>
  );
}
