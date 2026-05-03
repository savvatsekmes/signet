type Tone = "success" | "warning" | "neutral" | "danger";

const TONE: Record<Tone, { bg: string; fg: string }> = {
  success: { bg: "#E1F5EE", fg: "#1F5C3A" },
  warning: { bg: "#FAEEDA", fg: "#7A4520" },
  neutral: { bg: "var(--color-bg-tertiary)", fg: "var(--color-text-tertiary)" },
  danger: { bg: "#FBEAEA", fg: "#8B1A1A" },
};

interface Props {
  tone?: Tone;
  children: React.ReactNode;
}

export function StatusPill({ tone = "neutral", children }: Props) {
  const { bg, fg } = TONE[tone];
  return (
    <span className="status-pill" style={{ background: bg, color: fg }}>
      {children}
    </span>
  );
}
