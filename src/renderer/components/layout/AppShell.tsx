import type { ReactNode } from "react";

export function AppShell(props: { sidebar: ReactNode; content: ReactNode }) {
  const { sidebar, content } = props;

  return (
    <div className="lightcode-shell flex h-full min-h-0 overflow-hidden bg-background text-foreground">
      <div aria-hidden="true" className="lightcode-drag-region" />
      <aside className="h-full min-h-0 w-[350px] min-w-[350px] border-r border-[color:var(--border)]">
        {sidebar}
      </aside>
      <main className="relative h-full min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="relative h-full min-h-0">{content}</div>
      </main>
    </div>
  );
}
