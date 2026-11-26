import { useRef, useState, type Key, type RefObject } from "react";
import { Button, Modal, Tabs } from "@heroui/react";
import { Info } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Input } from "@/renderer/components/common";
import type { AgentSettingsHost } from "@/renderer/components/providers/settings/AgentSettingsHostContext";
import { LOCAL_PROFILE_MODEL_MAX_LENGTH } from "./localModelServer";
import { OllamaModelDownloadPanel, useOllamaModelDownload } from "./OllamaModelDownloadPanel";

type ModelSource = "ollama" | "huggingface" | "file";
type FileLocation = "computer" | "server";

/**
 * A separate, compact modal for binding a model that is already served by the
 * profile's fixed server. It never uploads, copies, or creates a route; Done
 * returns only the served model id to the parent draft.
 */
export function AgentProfileAddModelDialog(props: {
  isOpen: boolean;
  serverLabel: string;
  /** True only when the serving machine is demonstrably the selected workspace host. */
  sameAsWorkspaceHost: boolean;
  settingsHost: AgentSettingsHost;
  ollamaDownload: boolean;
  returnFocusRef?: RefObject<HTMLButtonElement | null> | undefined;
  onClose: () => void;
  onUseModel: (id: string) => void;
}) {
  const { t } = useLingui();
  const [source, setSource] = useState<ModelSource>(
    props.ollamaDownload ? "ollama" : "huggingface",
  );
  const [fileLocation, setFileLocation] = useState<FileLocation>("computer");
  const [repository, setRepository] = useState("");
  const [revision, setRevision] = useState("main");
  const [artifact, setArtifact] = useState("");
  const [filePath, setFilePath] = useState("");
  const [pickedFile, setPickedFile] = useState("");
  const [manualServedId, setManualServedId] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const [showServedInfo, setShowServedInfo] = useState(false);
  const ollamaDownload = useOllamaModelDownload(props.settingsHost);
  const downloadActive = ollamaDownload.running || ollamaDownload.cancelling;

  const close = () => {
    props.onClose();
    requestAnimationFrame(() => props.returnFocusRef?.current?.focus());
  };
  const manualServedTooLong = manualServedId.trim().length > LOCAL_PROFILE_MODEL_MAX_LENGTH;
  const downloadedOllamaTag =
    ollamaDownload.run?.phase === "success" ? ollamaDownload.run.tag : undefined;
  const activeServedId = source === "ollama" ? (downloadedOllamaTag ?? "") : manualServedId.trim();
  const activeServedTooLong = source !== "ollama" && manualServedTooLong;
  const done = () => {
    if (downloadActive || !activeServedId || activeServedTooLong) return;
    props.onUseModel(activeServedId);
    close();
  };
  const changeSource = (key: Key) => {
    const next = key as ModelSource;
    if (downloadActive && next !== "ollama") return;
    setSource(next);
  };
  const showLocationChoice = source === "file" && !props.sameAsWorkspaceHost;
  const onComputerFile = fileLocation === "computer";

  return (
    <Modal.Backdrop
      isOpen={props.isOpen}
      isDismissable={!downloadActive}
      isKeyboardDismissDisabled={downloadActive}
      onOpenChange={(open) => (open ? undefined : close())}
    >
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-[460px]">
          <Modal.Header>
            <Modal.Heading>{t`Add model`}</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="flex flex-col gap-3 p-4">
            {source !== "ollama" ? (
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-muted">
                  <Trans>Server</Trans>
                </span>
                <p className="form-field rounded-lg px-2.5 py-1.5 font-mono text-[11px] text-foreground">
                  {props.serverLabel}
                </p>
              </div>
            ) : null}

            <div className="flex items-center gap-1">
              <span className="text-[11px] font-medium text-muted">
                <Trans>Source</Trans>
              </span>
              <Button
                isIconOnly
                size="sm"
                variant="ghost"
                className="size-6 min-h-6 min-w-6 text-muted"
                aria-label={t`About model sources`}
                aria-expanded={showInfo}
                onPress={() => setShowInfo((open) => !open)}
              >
                <Info className="size-3.5" aria-hidden />
              </Button>
            </div>
            {showInfo ? (
              <p className="text-[11px] text-muted">
                {source === "ollama" ? (
                  <Trans>
                    Ollama downloads run only when you choose Download. The exact pulled tag becomes
                    available after completion.
                  </Trans>
                ) : props.sameAsWorkspaceHost ? (
                  <Trans>
                    The weights must already be available to the server on this host before this ID
                    can be used. Nothing is uploaded here.
                  </Trans>
                ) : (
                  <Trans>
                    A local file on this computer is not readable by a remote server. Copy or import
                    the weights there first, then enter the ID that server exposes. A Hugging Face
                    account is not needed for local files.
                  </Trans>
                )}
              </p>
            ) : null}
            <Tabs selectedKey={source} onSelectionChange={changeSource}>
              <Tabs.ListContainer className="agent-profile-tablist w-fit max-w-full self-start">
                <Tabs.List aria-label={t`Source`}>
                  {props.ollamaDownload ? (
                    <Tabs.Tab
                      id="ollama"
                      className="whitespace-nowrap max-sm:px-2 max-sm:text-[10px]"
                    >
                      <Trans>Ollama</Trans>
                      <Tabs.Indicator />
                    </Tabs.Tab>
                  ) : null}
                  <Tabs.Tab
                    id="huggingface"
                    isDisabled={downloadActive}
                    className="whitespace-nowrap max-sm:px-2 max-sm:text-[10px]"
                  >
                    <Trans>Hugging Face</Trans>
                    <Tabs.Indicator />
                  </Tabs.Tab>
                  <Tabs.Tab
                    id="file"
                    isDisabled={downloadActive}
                    className="whitespace-nowrap max-sm:px-2 max-sm:text-[10px]"
                  >
                    <Trans>File</Trans>
                    <Tabs.Indicator />
                  </Tabs.Tab>
                </Tabs.List>
              </Tabs.ListContainer>
              <Tabs.Panel id={source} className="flex flex-col gap-3 pt-3">
                {source === "ollama" ? (
                  <OllamaModelDownloadPanel
                    download={ollamaDownload}
                    destinationLabel={props.serverLabel}
                  />
                ) : source === "huggingface" ? (
                  <>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)]">
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] font-medium text-muted">
                          <Trans>Repository</Trans>
                        </span>
                        <Input
                          aria-label={t`Hugging Face repository`}
                          placeholder="org/model"
                          value={repository}
                          onChange={(event) => setRepository(event.target.value)}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] font-medium text-muted">
                          <Trans>Revision</Trans>
                        </span>
                        <Input
                          aria-label={t`Hugging Face revision`}
                          placeholder="main"
                          value={revision}
                          onChange={(event) => setRevision(event.target.value)}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-medium text-muted">
                        <Trans>Artifact (optional)</Trans>
                      </span>
                      <Input
                        aria-label={t`Hugging Face artifact`}
                        placeholder="model-Q4_K_M.gguf"
                        value={artifact}
                        onChange={(event) => setArtifact(event.target.value)}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    {showLocationChoice ? (
                      <Tabs
                        selectedKey={fileLocation}
                        onSelectionChange={(key) => setFileLocation(key as FileLocation)}
                      >
                        <Tabs.ListContainer className="agent-profile-tablist w-fit max-w-full self-start">
                          <Tabs.List aria-label={t`File location`}>
                            <Tabs.Tab
                              id="computer"
                              className="whitespace-nowrap max-sm:px-2 max-sm:text-[10px]"
                            >
                              <Trans>This computer</Trans>
                              <Tabs.Indicator />
                            </Tabs.Tab>
                            <Tabs.Tab
                              id="server"
                              className="whitespace-nowrap max-sm:px-2 max-sm:text-[10px]"
                            >
                              <Trans>On the server</Trans>
                              <Tabs.Indicator />
                            </Tabs.Tab>
                          </Tabs.List>
                        </Tabs.ListContainer>
                        <Tabs.Panel id={fileLocation} className="pt-3">
                          <FileLocationFields
                            onComputer={onComputerFile}
                            filePath={filePath}
                            onFilePathChange={setFilePath}
                            pickedFile={pickedFile}
                            onPickFile={(name) => setPickedFile(name)}
                          />
                        </Tabs.Panel>
                      </Tabs>
                    ) : (
                      <FileLocationFields
                        onComputer
                        filePath={filePath}
                        onFilePathChange={setFilePath}
                        pickedFile={pickedFile}
                        onPickFile={(name) => setPickedFile(name)}
                      />
                    )}
                  </>
                )}
              </Tabs.Panel>
            </Tabs>

            {source !== "ollama" ? (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1">
                  <span className="text-[11px] font-medium text-muted">
                    <Trans>Served model ID</Trans>
                  </span>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="ghost"
                    className="size-6 min-h-6 min-w-6 text-muted"
                    aria-label={t`About the served model ID`}
                    aria-expanded={showServedInfo}
                    onPress={() => setShowServedInfo((open) => !open)}
                  >
                    <Info className="size-3.5" aria-hidden />
                  </Button>
                </div>
                {showServedInfo ? (
                  <p className="text-[11px] text-muted">
                    <Trans>
                      Enter the ID the server exposes after the weights are available. Nothing is
                      uploaded or imported here.
                    </Trans>
                  </p>
                ) : null}
                <Input
                  aria-label={t`Served model ID`}
                  placeholder={t`ID the server exposes after loading`}
                  maxLength={LOCAL_PROFILE_MODEL_MAX_LENGTH}
                  value={manualServedId}
                  onChange={(event) => setManualServedId(event.target.value)}
                />
                {manualServedTooLong ? (
                  <p role="alert" className="text-[11px] text-danger">
                    <Trans>Model IDs are limited to 200 characters.</Trans>
                  </p>
                ) : null}
              </div>
            ) : null}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="ghost" isDisabled={downloadActive} onPress={close}>
              <Trans>Cancel</Trans>
            </Button>
            <Button
              variant="primary"
              isDisabled={downloadActive || !activeServedId || activeServedTooLong}
              onPress={done}
            >
              <Trans>Use model</Trans>
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function FileLocationFields(props: {
  onComputer: boolean;
  filePath: string;
  onFilePathChange: (value: string) => void;
  pickedFile: string;
  onPickFile: (name: string) => void;
}) {
  const { t } = useLingui();
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted">
        {props.onComputer ? <Trans>Model file</Trans> : <Trans>File on the server</Trans>}
      </span>
      {props.onComputer ? (
        <div className="flex min-w-0 items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            aria-label={t`Choose a model file`}
            onChange={(event) => props.onPickFile(event.target.files?.[0]?.name ?? "")}
          />
          <Button
            size="sm"
            variant="tertiary"
            className="h-7 min-h-7 px-2 text-[11px]"
            onPress={() => fileInputRef.current?.click()}
          >
            <Trans>Choose file…</Trans>
          </Button>
          <span className="min-w-0 truncate text-[11px] text-muted">
            {props.pickedFile || t`No file selected`}
          </span>
        </div>
      ) : (
        <Input
          aria-label={t`File path on the server`}
          className="font-mono text-xs"
          placeholder="/srv/models/org-model"
          value={props.filePath}
          onChange={(event) => props.onFilePathChange(event.target.value)}
        />
      )}
    </div>
  );
}
