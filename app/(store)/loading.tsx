// Shown the instant a navigation starts, so a tap gets immediate feedback
// instead of appearing to do nothing while the server renders.
export default function Loading() {
  return (
    <div className="flex animate-pulse flex-col gap-6 py-4" aria-label="Loading" role="status">
      <div className="h-8 w-2/3 rounded-lg bg-surface-2" />
      <div className="h-4 w-1/3 rounded bg-surface-2" />
      <div className="flex flex-col gap-3 pt-2">
        <div className="h-20 rounded-2xl bg-surface-2" />
        <div className="h-20 rounded-2xl bg-surface-2" />
        <div className="h-20 rounded-2xl bg-surface-2" />
      </div>
    </div>
  );
}
