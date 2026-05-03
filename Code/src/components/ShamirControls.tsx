interface Props {
  total: number;
  required: number;
  onChange: (total: number, required: number) => void;
  disabled?: boolean;
}

const MIN = 2;
const MAX = 7;

export function ShamirControls({ total, required, onChange, disabled }: Props) {
  const setTotal = (t: number) => {
    const clamped = Math.max(MIN, Math.min(MAX, t));
    const r = Math.min(required, clamped);
    onChange(clamped, Math.max(MIN, r));
  };
  const setRequired = (r: number) => {
    const clamped = Math.max(MIN, Math.min(total, r));
    onChange(total, clamped);
  };

  const circles = Array.from({ length: total }, (_, i) => i);

  return (
    <div className="shamir-box">
      <div className="shamir-title">Shamir key splitting</div>
      <div className="shamir-sub">
        Your vault key is split into shards. Any {required} of {total} people
        must come together to unlock — no single person can open it alone.
      </div>
      <div className="shamir-controls">
        <Stepper
          label="Total shards"
          value={total}
          min={MIN}
          max={MAX}
          onChange={setTotal}
          disabled={disabled}
        />
        <div className="shamir-of">of</div>
        <Stepper
          label="Required to unlock"
          value={required}
          min={MIN}
          max={total}
          onChange={setRequired}
          disabled={disabled}
        />
        <div className="shamir-visual-wrap">
          <div className="shamir-visual">
            {circles.map((i) => (
              <div
                key={i}
                className={
                  "shard-circle " +
                  (i < required ? "shard-filled" : "shard-empty")
                }
              >
                {i + 1}
              </div>
            ))}
          </div>
          <div className="shamir-hint">
            Any {required} of {total} unlocks the vault
          </div>
        </div>
      </div>
      <div className="shamir-explanation">
        Each shard is <strong>mathematically worthless alone</strong> — reveals
        zero information below the threshold. Losing one shard is not
        catastrophic.
      </div>
    </div>
  );
}

interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}

function Stepper({ label, value, min, max, onChange, disabled }: StepperProps) {
  return (
    <div className="shamir-field">
      <div className="shamir-label">{label}</div>
      <div className="shamir-value">{value}</div>
      <div className="shamir-stepper">
        <button
          type="button"
          className="step-btn"
          onClick={() => onChange(value - 1)}
          disabled={disabled || value <= min}
          aria-label={`Decrease ${label}`}
        >
          −
        </button>
        <button
          type="button"
          className="step-btn"
          onClick={() => onChange(value + 1)}
          disabled={disabled || value >= max}
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
}
