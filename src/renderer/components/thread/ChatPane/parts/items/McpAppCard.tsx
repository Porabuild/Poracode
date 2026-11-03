import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLingui } from "@lingui/react/macro";
import { AppWindow, Code2 } from "lucide-react";
import type { AppBridge, McpUiHostContext } from "@modelcontextprotocol/ext-apps/app-bridge";
import type { CallToolResult } from "@modelcontextprotocol/client";
import type { McpAppReference } from "@/shared/contracts/mcpApps";
import {
  readManagedLoopbackActivation,
  subscribeManagedLoopbackActivation,
} from "@/renderer/hostTransport/loopbackHttpWsTransport";
import {
  getRemoteBridgeClient,
  subscribeRemoteBridgeClient,
} from "@/renderer/browser/remoteBridge";
import { useResolvedAppearance } from "@/renderer/components/ui/provider";
import { Button } from "@/renderer/components/common/Button";
import { useChatPaneActions } from "../../chatPaneActionsContext";
import { InlineVisual } from "./InlineVisual";
import { VisualSource } from "./VisualSource";
import { CopyTextButton } from "./CopyTextButton";
import { readBridge } from "@/renderer/bridge";
import { submitThreadInput } from "@/renderer/actions/threadRuntimeActions";

function sandboxEndpoint(): string | undefined {
  // The bootstrap is public static code. App data and operations always use
  // the authenticated owning-thread bridge, even for a different paired host.
  return readManagedLoopbackActivation()?.endpoint ?? getRemoteBridgeClient()?.endpoint;
}

function subscribeEndpoint(listener: () => void): () => void {
  const stopManaged = subscribeManagedLoopbackActivation(listener);
  const stopRemote = subscribeRemoteBridgeClient(listener);
  return () => {
    stopManaged();
    stopRemote();
  };
}

interface McpAppCardProps {
  app: McpAppReference;
  threadId: string;
  html: string;
  title: string;
  input: Record<string, unknown>;
  result: CallToolResult;
}

export function McpAppCard({ app, threadId, html, title, input, result }: McpAppCardProps) {
  const { t, i18n } = useLingui();
  const theme = useResolvedAppearance();
  const actions = useChatPaneActions();
  const actionsRef = useRef(actions);
  useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);
  const endpoint = useSyncExternalStore(subscribeEndpoint, sandboxEndpoint, sandboxEndpoint);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<AppBridge | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [height, setHeight] = useState(240);
  const [showSource, setShowSource] = useState(false);
  const locale = i18n.locale;
  const contextRef = useRef<McpUiHostContext>({});
  useEffect(() => {
    const context: McpUiHostContext = {
      theme,
      locale,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      displayMode: "inline",
      availableDisplayModes: ["inline"],
      containerDimensions: { maxHeight: 1200 },
    };
    contextRef.current = context;
    bridgeRef.current?.setHostContext(context);
  }, [theme, locale]);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !endpoint) return;
    const controller = new AbortController();
    setState("loading");
    void import("@/shared/mcpApps/viewBridge")
      .then(({ mountMcpApp }) => {
        controller.signal.throwIfAborted();
        return mountMcpApp({
          frame,
          endpoint,
          threadId,
          app: {
            version: 1,
            sessionId: app.sessionId,
            toolName: app.toolName,
            resourceUri: app.resourceUri,
          },
          input,
          result,
          context: contextRef.current,
          signal: controller.signal,
          host: {
            appVersion: readBridge().appVersion,
            controlMcpApp: (payload) => readBridge().controlMcpApp(payload),
            openLink: async (url) => {
              await readBridge().openExternal(url);
            },
            sendMessage: (text) => submitThreadInput(threadId, text),
          },
          onReady: () => {
            if (!controller.signal.aborted) setState("ready");
          },
          onHeight: (nextHeight) => {
            if (controller.signal.aborted) return;
            setHeight(nextHeight);
            actionsRef.current?.onContentHeightChange?.();
          },
          onUnavailable: () => {
            if (!controller.signal.aborted) {
              setState("unavailable");
              controller.abort();
            }
          },
        });
      })
      .then((bridge) => {
        if (!controller.signal.aborted) bridgeRef.current = bridge;
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState("unavailable");
          controller.abort();
        }
      });
    return () => {
      controller.abort();
      bridgeRef.current = null;
      frame.removeAttribute("src");
    };
  }, [endpoint, threadId, app.sessionId, app.toolName, app.resourceUri, input, result]);

  if (!endpoint || state === "unavailable") return <InlineVisual html={html} title={title} />;
  return (
    <div
      data-poracode-mcp-app="true"
      className="not-prose my-2 flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-background text-foreground"
    >
      <div className="flex min-h-10 shrink-0 items-center gap-2 border-b border-border px-3 py-1">
        <AppWindow className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium" title={title}>
          {title}
        </span>
        <Button
          variant="ghost"
          size="sm"
          isIconOnly
          aria-label={t`Show source`}
          aria-pressed={showSource}
          className="size-6 min-w-6 text-muted"
          onPress={() => setShowSource(!showSource)}
        >
          <Code2 className="size-3.5" />
        </Button>
        <CopyTextButton text={html} label={t`Copy source`} />
      </div>
      {state === "loading" && (
        <p className="px-3 py-2 text-xs text-muted" role="status">{t`Loading app…`}</p>
      )}
      <iframe
        ref={frameRef}
        title={title}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        className="w-full border-0"
        style={{ height }}
      />
      {showSource && (
        <div className="max-h-[70vh] overflow-auto border-t border-border p-3">
          <VisualSource text={html} lang="html" />
        </div>
      )}
    </div>
  );
}
