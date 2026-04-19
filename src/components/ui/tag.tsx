import { cn } from "@/lib/utils";

/**
 * Tag — compact label pill. Used for model names, providers, statuses.
 * Mirrors the design-system tag sizing; colors adjusted for dark theme.
 */

type Tone = "neutral" | "info" | "ok" | "warn" | "danger" | "anthropic" | "openai";

const tones: Record<Tone, { bg: string; fg: string; border: string }> = {
  neutral:   { bg: "#D2E2D7",                  fg: "#15302A", border: "#C8DCD0" },
  info:      { bg: "rgba(122,107,176,0.12)",   fg: "#5E4E94", border: "rgba(122,107,176,0.35)" },
  ok:        { bg: "rgba(79,122,88,0.14)",     fg: "#3D6046", border: "rgba(79,122,88,0.35)" },
  warn:      { bg: "rgba(197,106,45,0.14)",    fg: "#9E4F16", border: "rgba(197,106,45,0.35)" },
  danger:    { bg: "rgba(176,74,59,0.14)",     fg: "#8C3829", border: "rgba(176,74,59,0.4)" },
  anthropic: { bg: "rgba(197,106,45,0.12)",    fg: "#9E4F16", border: "rgba(197,106,45,0.35)" },
  openai:    { bg: "rgba(79,122,88,0.12)",     fg: "#3D6046", border: "rgba(79,122,88,0.35)" },
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
  const { bg, fg, border } = tones[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-[2px] text-[0.7rem] font-semibold tnum",
        className,
      )}
      style={{ backgroundColor: bg, color: fg, borderColor: border }}
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
