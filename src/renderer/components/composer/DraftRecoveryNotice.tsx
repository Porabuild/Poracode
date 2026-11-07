import { clientDraftPersistenceError } from "@/renderer/state/composerDrafts/persistenceError";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { Button } from "@/renderer/components/common/Button";
import {
  composerDraftStorage,
  draftContentSchema,
  type DraftKind,
} from "@/renderer/state/composerDraftStorage";
import {
  discardClientSubmission,
  listClientSubmissionsForDraft,
  reclaimClientDraftAssets,
  subscribeClientDraftSubmissions,
  type ClientDraftSubmission,
} from "@/renderer/state/composerDrafts/clientDraftDatabase";
import type { DraftContent } from "@/renderer/state/slices/types";

/** Failed submissions remain user-accessible after navigation or a client restart. */
export function DraftRecoveryNotice(props: {
  kind: DraftKind;
  ownerId: string;
  pending: boolean;
  onRestore(content: DraftContent, replace?: boolean): void;
}) {
  const [record, setRecord] = useState<ClientDraftSubmission | undefined>();
  const [busyKey, setBusyKey] = useState<string>();
  const [copiedKey, setCopiedKey] = useState<string>();
  const scope = JSON.stringify([props.kind, props.ownerId]);
  const scopeRef = useRef(scope);
  useLayoutEffect(() => {
    scopeRef.current = scope;
  }, [scope]);
  useEffect(() => {
    let active = true;
    let refreshGeneration = 0;
    const refresh = () => {
      const generation = ++refreshGeneration;
      const identity = composerDraftStorage()?.currentIdentity(props.kind, props.ownerId);
      void listClientSubmissionsForDraft(
        JSON.stringify([props.kind, props.ownerId]),
        identity?.draftId,
      )
        .then((records) => {
          if (!active || refreshGeneration !== generation) return;
          setRecord(
            records.findLast(
              (candidate) =>
                (candidate.scope === JSON.stringify([props.kind, props.ownerId]) ||
                  candidate.draftId === identity?.draftId) &&
                (candidate.state === "failed" ||
                  candidate.state === "uncertain" ||
                  candidate.state === "prepared" ||
                  candidate.state === "dispatching"),
            ),
          );
        })
        .catch(() => undefined);
    };
    const unsubscribe = subscribeClientDraftSubmissions(refresh);
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener("focus", refresh);
    };
  }, [props.kind, props.ownerId]);
  const identity = composerDraftStorage()?.currentIdentity(props.kind, props.ownerId);
  if (!record || props.pending || (record.scope !== scope && record.draftId !== identity?.draftId))
    return null;
  const uncertain = record.state === "uncertain" || record.state === "dispatching";
  const operationKey = JSON.stringify([scope, record.id, record.revision, record.fingerprint]);
  const busy = busyKey === operationKey;
  const finish = async (restore: boolean) => {
    setBusyKey(operationKey);
    try {
      if (restore) {
        const envelope = record.content as {
          checkpoint?: { content?: unknown };
          recoveryContent?: unknown;
        };
        const content = draftContentSchema.parse(
          envelope.recoveryContent ?? envelope.checkpoint?.content,
        );
        props.onRestore(content);
        const storage = composerDraftStorage();
        if (!storage) throw clientDraftPersistenceError();
        await storage.recover(props.kind, props.ownerId, (restored) => {
          if (scopeRef.current === scope) props.onRestore(restored, true);
        });
      }
      if (uncertain && restore) {
        setCopiedKey(operationKey);
        return;
      }
      if (!(await discardClientSubmission(record.id, !restore, record))) return;
      const storage = composerDraftStorage();
      if (storage?.canReclaimAssets())
        await reclaimClientDraftAssets(record.assets, () =>
          storage.canReclaimAssets() ? storage.referencedAssets() : new Set(record.assets),
        );
      if (scopeRef.current === scope)
        setRecord((current) =>
          current?.id === record.id &&
          current.revision === record.revision &&
          current.fingerprint === record.fingerprint
            ? undefined
            : current,
        );
    } catch (error) {
      toast.danger(clientDraftPersistenceError(error).message);
    } finally {
      setBusyKey((current) => (current === operationKey ? undefined : current));
    }
  };
  return (
    <div role="status" className="flex items-center gap-2 px-2 py-1 text-xs text-muted">
      <span className="min-w-0 flex-1">
        {uncertain ? (
          <Trans>
            Couldn't confirm this command with the host. It may still have been applied — check the
            thread before trying again.
          </Trans>
        ) : (
          <Trans>A previous submission is saved on this device.</Trans>
        )}
      </span>
      {uncertain && (
        <Button
          size="sm"
          variant="ghost"
          isDisabled={busy || copiedKey === operationKey}
          onPress={() => void finish(true)}
        >
          <Trans>Restore a copy</Trans>
        </Button>
      )}
      {!uncertain && (
        <Button size="sm" variant="ghost" isDisabled={busy} onPress={() => void finish(true)}>
          <Trans>Restore</Trans>
        </Button>
      )}
      <Button size="sm" variant="ghost" isDisabled={busy} onPress={() => void finish(false)}>
        <Trans>Discard saved copy</Trans>
      </Button>
    </div>
  );
}
