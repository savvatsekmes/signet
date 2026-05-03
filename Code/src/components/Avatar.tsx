interface Props {
  name: string;
  bg?: string;
  fg?: string;
  size?: number;
}

const PALETTE = [
  { bg: "#E6F1FB", fg: "#1F4673" },
  { bg: "#FFF1E6", fg: "#7A4520" },
  { bg: "#E8F4EA", fg: "#1F5C3A" },
  { bg: "#FBEAF0", fg: "#72243E" },
  { bg: "#EEEDFE", fg: "#3C3489" },
];

function pick(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "·";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ name, bg, fg, size = 26 }: Props) {
  const palette = pick(name);
  return (
    <div
      className="avatar"
      style={{
        background: bg ?? palette.bg,
        color: fg ?? palette.fg,
        width: size,
        height: size,
        fontSize: Math.max(9, Math.round(size * 0.34)),
      }}
    >
      {initialsOf(name)}
    </div>
  );
}
