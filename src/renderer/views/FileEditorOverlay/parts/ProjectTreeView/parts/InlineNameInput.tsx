import { useEffect, useRef } from "react";

export function InlineNameInput(props: {
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onCommit: (value: string) => void;
}) {
  const { value, onChange, onCancel, onCommit } = props;
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    // Select name without extension for rename-friendly UX. Only runs on mount —
    // we don't want to re-select on every keystroke as `value` changes.
    const dot = value.lastIndexOf(".");
    if (dot > 0) el.setSelectionRange(0, dot);
    else el.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <input
      ref={ref}
      type="text"
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => (value.trim() ? onCommit(value.trim()) : onCancel())}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (value.trim()) onCommit(value.trim());
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      className="w-full rounded border border-default-300 bg-background px-1 text-sm outline-none focus:border-primary"
    />
  );
}
