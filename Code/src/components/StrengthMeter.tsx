import { useMemo } from "react";
import zxcvbn from "zxcvbn";

interface Props {
  password: string;
  userInputs?: string[];
}

const COLORS = ["#c0392b", "#d35400", "#d99a3a", "#7faa48", "#2f8849"];
const LABELS = ["Very weak", "Weak", "Okay", "Strong", "Excellent"];

export interface StrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  warning?: string;
  suggestions: string[];
}

export function evaluateStrength(
  password: string,
  userInputs: string[] = []
): StrengthResult {
  if (!password) {
    return { score: 0, label: "—", suggestions: [] };
  }
  const result = zxcvbn(password, userInputs);
  return {
    score: result.score as 0 | 1 | 2 | 3 | 4,
    label: LABELS[result.score],
    warning: result.feedback.warning || undefined,
    suggestions: result.feedback.suggestions ?? [],
  };
}

export function StrengthMeter({ password, userInputs }: Props) {
  const result = useMemo(
    () => evaluateStrength(password, userInputs),
    [password, userInputs]
  );

  return (
    <div className="strength">
      <div className="strength-bars">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="strength-bar"
            style={{
              background:
                password && i <= result.score
                  ? COLORS[result.score]
                  : "var(--color-border-light)",
            }}
          />
        ))}
      </div>
      <div className="strength-label">{password ? result.label : "—"}</div>
    </div>
  );
}
