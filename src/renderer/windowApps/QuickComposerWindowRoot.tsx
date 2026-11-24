import { QuickComposerWindowApp } from "./QuickComposerWindowApp";

/**
 * Root of the quick-composer window. `main.tsx` loads this instead of the app
 * shell, so the overlay's renderer never evaluates the main view, the thread
 * panes, or the shell's module-level runtime wiring.
 */
export function App() {
  return <QuickComposerWindowApp />;
}
