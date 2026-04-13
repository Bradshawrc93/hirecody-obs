import { cn } from "@/lib/utils";

/**
 * Tag — compact label pill. Used for model names, providers, statuses.
 * Mirrors the design-system tag sizing; colors adjusted for dark theme.
 */

type Tone = "neutral" | "info" | "ok" | "warn" | "danger" | "anthropic" | "openai";

const tones: Record<Tone, { bg: string; fg: string }> = {
  neutral:   { bg: "#1F1F24", fg: "#C4C4CC" },
  info:      { bg: "rgba(96,165,250,0.12)",  fg: "#60A5FA" },
  ok:        { bg: "rgba(16,185,129,0.12)",  fg: "#34D399" },
  warn:      { bg: "rgba(245,158,11,0.14)",  fg: "#F59E0B" },
  danger:    { bg: "rgba(239,68,68,0.14)",   fg: "#F87171" },
  anthropic: { bg: "rgba(245,158,11,0.12)",  fg: "#F59E0B" },
  openai:    { bg: "rgba(16,185,129,0.12)",  fg: "#10B981" },
};

export function Tag({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  const { bg, fg } = tones[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-[2px] text-[0.7rem] font-semibold tnum",
        className,
      )}
      style={{ backgroundColor: bg, color: fg }}
    >
      {children}
    </span>
  );
}

export function providerTone(provider: string): Tone {
  if (provider?.toLowerCase() === "anthropic") return "anthropic";
  if (provider?.toLowerCase() === "openai")    return "openai";
  return "info";
}
