import { useEffect, useRef, useState } from "react";

export interface PromptOption {
  key: string;
  label: string;
  description?: string | undefined;
  isTextInput?: boolean | undefined;
}

export function PromptOptions(props: {
  title?: string | undefined;
  options: PromptOption[];
  onSelect: (key: string) => void;
  onSubmitText?: ((key: string, text: string) => void) | undefined;
  onCancel?: (() => void) | undefined;
}) {
  const { title, options, onSelect, onSubmitText, onCancel } = props;
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [textValue, setTextValue] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options[selectedIndex];
  const isTextMode = selectedOption?.isTextInput === true;

  useEffect(() => {
    setSelectedIndex(0);
    setTextValue("");
    containerRef.current?.focus();
  }, [title, options.length]);

  useEffect(() => {
    if (isTextMode) {
      textInputRef.current?.focus();
    }
  }, [isTextMode]);

  const activateOption = (option: PromptOption) => {
    if (option.isTextInput) {
      // Text input options are handled by the inline input's Enter key
      return;
    }
    onSelect(option.key);
  };

  return (
    <div
      ref={containerRef}
      role="listbox"
      className="flex flex-col gap-0.5 px-3 py-2 outline-none"
      onKeyDown={(event) => {
        if (isTextMode) return;
        if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
          event.preventDefault();
          setSelectedIndex((i) => (i > 0 ? i - 1 : options.length - 1));
        } else if (event.key === "ArrowDown" || event.key === "ArrowRight") {
          event.preventDefault();
          setSelectedIndex((i) => (i < options.length - 1 ? i + 1 : 0));
        } else if (event.key === "Enter") {
          event.preventDefault();
          if (selectedOption) activateOption(selectedOption);
        } else if (event.key >= "1" && event.key <= "9") {
          const opt = options[Number(event.key) - 1];
          if (opt) activateOption(opt);
        } else if (event.key === "Escape" && onCancel) {
          onCancel();
        }
      }}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
    >
      {title ? <p className="px-1 pb-1 text-sm font-medium text-foreground">{title}</p> : null}
      {options.map((option, index) => {
        const isSelected = index === selectedIndex;

        if (option.isTextInput && isSelected) {
          return (
            <div
              key={option.key}
              className="flex items-center gap-2 rounded-2xl bg-[color:var(--accent)]/10 px-2 py-2"
            >
              <kbd className="inline-flex size-5 shrink-0 items-center justify-center rounded border border-[color:var(--border)] text-xs font-medium text-foreground">
                {option.key}
              </kbd>
              <input
                ref={textInputRef}
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
                placeholder={option.label}
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && textValue.trim().length > 0) {
                    event.preventDefault();
                    event.stopPropagation();
                    onSubmitText?.(option.key, textValue.trim());
                    setTextValue("");
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    setTextValue("");
                    containerRef.current?.focus();
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setSelectedIndex((i) => (i > 0 ? i - 1 : options.length - 1));
                    containerRef.current?.focus();
                  } else if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setSelectedIndex((i) => (i < options.length - 1 ? i + 1 : 0));
                    containerRef.current?.focus();
                  }
                }}
              />
            </div>
          );
        }

        return (
          <button
            key={option.key}
            className={`flex items-center gap-2 rounded-2xl px-2 py-2 text-left text-sm transition ${
              isSelected ? "bg-[color:var(--accent)]/10 text-foreground" : "text-muted"
            }`}
            onClick={() => activateOption(option)}
            onMouseEnter={() => setSelectedIndex(index)}
            type="button"
          >
            <kbd className="inline-flex size-5 shrink-0 items-center justify-center rounded border border-[color:var(--border)] text-xs font-medium">
              {option.key}
            </kbd>
            <span className="font-medium">{option.label}</span>
            {option.description ? (
              <span className="text-xs text-muted/60">{option.description}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
