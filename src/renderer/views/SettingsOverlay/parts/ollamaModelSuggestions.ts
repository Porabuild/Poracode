export type OllamaModelSuggestion = {
  id: string;
  name: string;
  tag: string;
  sizeLabel: string;
};

/** Curated local-library shortlist, ordered by approximate download size. */
export const OLLAMA_MODEL_SUGGESTIONS: readonly OllamaModelSuggestion[] = [
  { id: "llama3.2:3b", name: "Llama 3.2", tag: "llama3.2:3b", sizeLabel: "~2 GB" },
  { id: "gemma3:4b", name: "Gemma 3", tag: "gemma3:4b", sizeLabel: "~3.4 GB" },
  { id: "qwen3:8b", name: "Qwen3", tag: "qwen3:8b", sizeLabel: "~5.2 GB" },
  { id: "gpt-oss:20b", name: "gpt-oss", tag: "gpt-oss:20b", sizeLabel: "~14 GB" },
  {
    id: "qwen3-coder:30b",
    name: "Qwen3 Coder",
    tag: "qwen3-coder:30b",
    sizeLabel: "~19 GB",
  },
  {
    id: "inkling-2-mini:latest",
    name: "Inkling 2 Mini",
    tag: "inkling-2-mini:latest",
    sizeLabel: "~20 GB",
  },
];

export function filterOllamaModelSuggestions(query: string): readonly OllamaModelSuggestion[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return OLLAMA_MODEL_SUGGESTIONS;
  return OLLAMA_MODEL_SUGGESTIONS.filter(
    (option) =>
      option.tag.toLowerCase().includes(normalized) ||
      option.name.toLowerCase().includes(normalized),
  );
}
