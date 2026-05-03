import { useEffect, useRef, useState } from "react";

interface Props {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  /** Fires when the input loses focus (after the dropdown closes). */
  onBlur?: () => void;
  autoFocus?: boolean;
  /** When true, allows typing free-text values not in the list. Default true. */
  allowCustom?: boolean;
}

/**
 * Hybrid input + dropdown. Click anywhere on the field to see ALL options
 * (no need to delete what's there first). Clicking an option replaces the
 * value. Free-text typing still works for custom entries.
 */
export function Combobox({
  value,
  options,
  onChange,
  placeholder,
  className,
  id,
  onBlur,
  autoFocus,
  allowCustom = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (opt: string) => {
    onChange(opt);
    setOpen(false);
    // Return focus to input so further typing works without clicking again.
    inputRef.current?.focus();
  };

  return (
    <div className="combobox" ref={wrapRef}>
      <div className="combobox-row">
        <input
          id={id}
          ref={inputRef}
          className={className ?? "password-input"}
          value={value}
          onChange={(e) => {
            if (!allowCustom) return;
            // Typing commits a custom value — close the dropdown so the
            // field doesn't feel like it's waiting for a list match.
            setOpen(false);
            onChange(e.target.value);
          }}
          onClick={() => setOpen(true)}
          onBlur={onBlur}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          autoFocus={autoFocus}
          readOnly={!allowCustom}
        />
        <button
          type="button"
          className="combobox-chevron"
          onClick={(e) => {
            e.preventDefault();
            setOpen((o) => !o);
            inputRef.current?.focus();
          }}
          tabIndex={-1}
          aria-label="Show options"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path
              d="M2 4l3 3 3-3"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      {open && options.length > 0 && (
        <div className="combobox-list" role="listbox">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              role="option"
              aria-selected={opt === value}
              className={
                "combobox-option" + (opt === value ? " combobox-selected" : "")
              }
              onMouseDown={(e) => {
                // Use mousedown so we beat the input's blur.
                e.preventDefault();
                choose(opt);
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
