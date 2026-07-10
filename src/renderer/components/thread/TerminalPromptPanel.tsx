import { Button } from "../common/Button";

interface TerminalPromptOption {
  key: string;
  label: string;
}

interface TerminalPrompt {
  title?: string;
  options: TerminalPromptOption[];
}

export function TerminalPromptPanel(props: {
  prompt: TerminalPrompt;
  onSelect: (key: string) => void;
}) {
  const { prompt, onSelect } = props;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:color-mix(in_oklab,var(--surface)_94%,transparent)] px-4 py-3">
      {prompt.title ? (
        <span className="mr-1 text-sm font-medium text-foreground">{prompt.title}</span>
      ) : null}
      {prompt.options.map((option) => (
        <Button
          key={option.key}
          className="rounded-full px-3"
          size="sm"
          variant="secondary"
          onPress={() => onSelect(option.key)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
