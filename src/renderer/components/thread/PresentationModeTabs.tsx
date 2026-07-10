import { MessageSquare, TerminalSquare } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { ThreadPresentationMode } from "@/shared/contracts";
import { LightballTabs, type LightballTab } from "@/renderer/components/common/LightballTabs";

export interface PresentationModeTabsProps {
  presentationMode: ThreadPresentationMode;
  onChange: (next: ThreadPresentationMode) => void;
  /** When false, the CLI tab renders disabled. */
  supportsTerminal: boolean;
  /** When false, the Chat tab renders disabled. */
  supportsGui: boolean;
  className?: string;
}

export function PresentationModeTabs(props: PresentationModeTabsProps) {
  const { presentationMode, onChange, supportsTerminal, supportsGui, className } = props;
  const { t } = useLingui();

  const tabs: ReadonlyArray<LightballTab<ThreadPresentationMode>> = [
    {
      id: "gui",
      label: t`Chat`,
      icon: <MessageSquare className="size-3" />,
      disabled: !supportsGui,
    },
    {
      id: "terminal",
      label: t`CLI`,
      icon: <TerminalSquare className="size-3" />,
      disabled: !supportsTerminal,
    },
  ];

  return (
    <div className={`${className ?? ""} flex justify-center`}>
      <LightballTabs
        tabs={tabs}
        active={presentationMode}
        onChange={onChange}
        ariaLabel={t`Thread mode`}
        className="w-[140px]"
        equalWidth
        delayActiveText
        shape="rounded"
        transparent
      />
    </div>
  );
}
