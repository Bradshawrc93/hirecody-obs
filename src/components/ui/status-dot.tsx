/**
 * StatusDot — 8px colored circle used on app cards and live tail rows.
 * Colors:
 *   ok     → green (events in last hour)
 *   warn   → amber (events in last 24h)
 *   idle   → dim gray
 *   error  → red
 */
type Tone = "ok" | "warn" | "idle" | "error";

const colors: Record<Tone, string> = {
  ok:    "#4F7A58",
  warn:  "#C56A2D",
  idle:  "#C2B8A4",
  error: "#B04A3B",
};

export function StatusDot({ tone, title }: { tone: Tone; title?: string }) {
  return (
    <span
      title={title}
      aria-label={title}
      className="inline-block rounded-full"
      style={{
        width: 8,
        height: 8,
        backgroundColor: colors[tone],
      }}
    />
  );
}
