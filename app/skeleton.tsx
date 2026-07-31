// Loading states shaped like the thing that's coming. A skeleton that matches
// the real layout makes the wait feel like the page is assembling; the word
// "Loading…" makes it feel like nothing is happening.

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card p-5 space-y-3">
      <div className="skeleton h-4 w-40" />
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton h-3" style={{ width: `${88 - i * 14}%` }} />
      ))}
    </div>
  );
}

/** Stat tiles above a list — the shape most of the app opens with. */
export function SkeletonPage({ tiles = 4, rows = 3 }: { tiles?: number; rows?: number }) {
  return (
    <div className="space-y-5 animate-fade-in">
      <div className={`grid grid-cols-2 sm:grid-cols-${tiles} gap-2.5`}>
        {Array.from({ length: tiles }, (_, i) => (
          <div key={i} className="card px-4 py-3.5 space-y-2">
            <div className="skeleton h-6 w-16" />
            <div className="skeleton h-2.5 w-20" />
          </div>
        ))}
      </div>
      <div className="space-y-2.5">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="card p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="skeleton h-4 w-44" />
              <div className="skeleton h-6 w-24 rounded-lg" />
            </div>
            <div className="skeleton h-3 w-56" />
            <div className="skeleton h-1.5 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A settings-style page: a few stacked panels. */
export function SkeletonPanels({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-5 animate-fade-in">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} lines={i === 0 ? 2 : 3} />
      ))}
    </div>
  );
}
