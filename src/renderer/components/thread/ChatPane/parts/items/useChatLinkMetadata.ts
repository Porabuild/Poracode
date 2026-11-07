import { useEffect, useState } from "react";
import { readBridge } from "@/renderer/bridge";

export interface ChatLinkMetadata {
  title: string | null;
  description: string | null;
}

const CACHE_LIMIT = 100;
const metadataRequests = new Map<string, Promise<ChatLinkMetadata>>();

export function useChatLinkMetadata(href: string, enabled: boolean): ChatLinkMetadata | null {
  const [result, setResult] = useState<{ href: string; metadata: ChatLinkMetadata } | null>(null);

  useEffect(() => {
    if (!enabled || !/^https?:/iu.test(href)) return;
    let active = true;
    void requestMetadata(href).then((metadata) => {
      if (active) setResult({ href, metadata });
    });
    return () => {
      active = false;
    };
  }, [href, enabled]);

  return result?.href === href ? result.metadata : null;
}

function requestMetadata(href: string): Promise<ChatLinkMetadata> {
  const existing = metadataRequests.get(href);
  if (existing) return existing;
  const request = Promise.resolve()
    .then(() => readBridge().resolveLinkMetadata({ url: href }))
    .catch((): ChatLinkMetadata => ({ title: null, description: null }));
  metadataRequests.set(href, request);
  if (metadataRequests.size > CACHE_LIMIT) {
    metadataRequests.delete(metadataRequests.keys().next().value!);
  }
  return request;
}
