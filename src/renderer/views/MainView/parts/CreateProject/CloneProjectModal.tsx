import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, FolderOpen, Link2, Lock, Monitor, Search } from "lucide-react";
import { Button, Dropdown, Label, Modal } from "@heroui/react";
import type { GitHubAccount, GitHubRepoSummary } from "@/shared/contracts";
import {
  cloneFolderNameFromRepo,
  cloneFolderNameFromUrl,
  splitPathLeaf,
  validateProjectName,
  validateScratchParent,
  wslHomeDir,
  type RuntimeChoice,
} from "@/shared/createProject";
import { getProjectFsPath } from "@/shared/wsl";
import { readBridge } from "@/renderer/bridge";
import { loadHomeScopeLocation } from "@/renderer/actions/projectActions";
import {
  commitCloneProject,
  resolveRuntimeContextLocation,
} from "@/renderer/actions/createProjectActions";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { Input, PixelLoader, TuxIcon } from "@/renderer/components/common";
import { formatRelativeTime } from "@/renderer/utils/formatTime";

type CloneMode = "github" | "url";

/** GitHub "mark" logo — lucide dropped brand icons, so we inline it. */
function GithubMark(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={props.className}>
      <path d="M12 .5C5.37.5 0 5.78 0 12.292c0 5.211 3.438 9.63 8.205 11.188.6.111.82-.254.82-.567 0-.28-.01-1.022-.015-2.005-3.338.711-4.042-1.582-4.042-1.582-.546-1.361-1.333-1.724-1.333-1.724-1.09-.731.082-.716.082-.716 1.205.082 1.84 1.215 1.84 1.215 1.07 1.803 2.809 1.282 3.495.98.108-.763.417-1.282.76-1.577-2.665-.295-5.466-1.309-5.466-5.827 0-1.287.465-2.339 1.235-3.164-.135-.295-.54-1.488.105-3.105 0 0 1.005-.316 3.3 1.209.96-.262 1.98-.392 3-.397 1.02.005 2.04.135 3 .397 2.295-1.525 3.3-1.209 3.3-1.209.645 1.617.24 2.81.12 3.105.765.825 1.23 1.877 1.23 3.164 0 4.53-2.805 5.527-5.475 5.817.42.354.81 1.077.81 2.182 0 1.578-.015 2.846-.015 3.229 0 .315.21.689.825.573C20.565 21.917 24 17.495 24 12.292 24 5.78 18.627.5 12 .5z" />
    </svg>
  );
}

function choiceForRuntime(runtimeKey: string): RuntimeChoice {
  return runtimeKey === "native" ? { kind: "native" } : { kind: "wsl", distro: runtimeKey };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Modal for the "Clone a repository" flow. Two modes: browse a signed-in
 * GitHub CLI account's repositories, or paste any git clone URL. Either way the
 * clone lands in a chosen parent folder (defaulting to the last-used one, like
 * "Start from scratch") and is opened as a new project.
 */
export function CloneProjectModal() {
  const open = usePanelStore((s) => s.cloneProjectModalOpen);

  return (
    <Modal.Backdrop
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) usePanelStore.getState().closeCloneProjectModal();
      }}
    >
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-[560px]">
          {open ? <CloneProjectForm /> : null}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function CloneProjectForm() {
  const lastUsedProjectDirs = useSharedSettings((s) => s.lastUsedProjectDirs);

  const [distros, setDistros] = useState<string[]>([]);
  const [runtimeKey, setRuntimeKey] = useState("native");
  const [defaultDir, setDefaultDir] = useState("");
  const [dir, setDir] = useState("");

  const [mode, setMode] = useState<CloneMode>("github");
  const modeTouched = useRef(false);

  // null while loading; [] once we know there are none.
  const [accounts, setAccounts] = useState<GitHubAccount[] | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<GitHubAccount | null>(null);
  const [repos, setRepos] = useState<GitHubRepoSummary[] | null>(null);
  const [reposError, setReposError] = useState<string | null>(null);
  const [repoSearch, setRepoSearch] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepoSummary | null>(null);

  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const nameTouched = useRef(false);

  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const choice = choiceForRuntime(runtimeKey);
  const showRuntime = distros.length > 0;

  // Available WSL distros gate the runtime picker (Windows only in practice).
  useEffect(() => {
    let active = true;
    void readBridge()
      .listWslDistros()
      .then((list) => {
        if (active) setDistros(list);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  // Resolve the default browse directory (last-used → home) for the runtime.
  const lastForRuntime = lastUsedProjectDirs[runtimeKey];
  useEffect(() => {
    let active = true;
    if (lastForRuntime) {
      setDefaultDir(lastForRuntime);
      return;
    }
    if (runtimeKey !== "native") {
      setDefaultDir(wslHomeDir(runtimeKey));
      return;
    }
    setDefaultDir("");
    void loadHomeScopeLocation()
      .then((location) => {
        if (active) setDefaultDir(getProjectFsPath(location));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [runtimeKey, lastForRuntime]);

  // Switching runtime clears the browsed folder and any error.
  useEffect(() => {
    setDir("");
    setSubmitError(null);
  }, [runtimeKey]);

  // Load the signed-in GitHub CLI accounts for the chosen runtime. Keyed on the
  // runtime only (not `mode`), so toggling the GitHub/Clone-URL tabs doesn't
  // re-fetch accounts or discard the user's account/repo selection.
  useEffect(() => {
    let active = true;
    setAccounts(null);
    setSelectedAccount(null);
    setRepos(null);
    setReposError(null);
    void resolveRuntimeContextLocation(choiceForRuntime(runtimeKey))
      .then((runtime) => readBridge().ghListAccounts({ runtime }))
      .then((result) => {
        if (!active) return;
        setAccounts(result.accounts);
        setSelectedAccount(result.accounts.find((a) => a.active) ?? result.accounts[0] ?? null);
        // Nothing to browse → fall back to the paste-a-URL mode unless the user
        // has already chosen a mode themselves.
        if (result.accounts.length === 0 && !modeTouched.current) setMode("url");
      })
      .catch(() => {
        if (active) setAccounts([]);
      });
    return () => {
      active = false;
    };
  }, [runtimeKey]);

  // Load the selected account's repositories.
  const accountKey = selectedAccount ? `${selectedAccount.host}\n${selectedAccount.login}` : null;
  useEffect(() => {
    if (!selectedAccount) return;
    let active = true;
    setRepos(null);
    setReposError(null);
    setSelectedRepo(null);
    setRepoSearch("");
    const account = { host: selectedAccount.host, login: selectedAccount.login };
    void resolveRuntimeContextLocation(choiceForRuntime(runtimeKey))
      .then((runtime) => readBridge().ghListRepos({ runtime, account }))
      .then((result) => {
        if (active) setRepos(result.repos);
      })
      .catch((error) => {
        if (!active) return;
        setRepos([]);
        setReposError(errorMessage(error, "Couldn't list repositories."));
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtimeKey, accountKey]);

  const query = repoSearch.trim().toLowerCase();
  const filteredRepos = (repos ?? []).filter(
    (r) =>
      !query ||
      r.nameWithOwner.toLowerCase().includes(query) ||
      r.description.toLowerCase().includes(query),
  );

  const scratchParent = dir || defaultDir;
  const pickerLeaf = scratchParent ? splitPathLeaf(scratchParent) : null;

  const targetError =
    mode === "github"
      ? selectedRepo
        ? null
        : "Select a repository."
      : url.trim()
        ? null
        : "Enter a repository URL.";
  const nameError = validateProjectName(name);
  const parentError = validateScratchParent(scratchParent, choice);
  const validationError = targetError ?? nameError ?? parentError;
  const parentMismatch = scratchParent ? parentError : null;
  const inlineError = submitError ?? parentMismatch;

  function selectMode(next: CloneMode) {
    modeTouched.current = true;
    setMode(next);
    setSubmitError(null);
  }

  function selectRepo(repo: GitHubRepoSummary) {
    setSelectedRepo(repo);
    setSubmitError(null);
    if (!nameTouched.current) setName(cloneFolderNameFromRepo(repo.nameWithOwner));
  }

  function changeUrl(value: string) {
    setUrl(value);
    setSubmitError(null);
    if (!nameTouched.current) setName(cloneFolderNameFromUrl(value));
  }

  async function handleBrowse() {
    const picked = await readBridge().pickFolder(scratchParent || undefined);
    if (!picked) return;
    setDir(picked);
    setSubmitError(null);
  }

  async function handleSubmit() {
    if (validationError) return;
    setBusy(true);
    setSubmitError(null);
    try {
      const source =
        mode === "github"
          ? ({
              kind: "github",
              nameWithOwner: selectedRepo!.nameWithOwner,
              account: { host: selectedAccount!.host, login: selectedAccount!.login },
            } as const)
          : ({ kind: "url", url: url.trim() } as const);
      await commitCloneProject({ choice, parentDir: scratchParent, name, source });
      usePanelStore.getState().closeCloneProjectModal();
    } catch (error) {
      setSubmitError(errorMessage(error, "Couldn't clone the repository."));
    } finally {
      setBusy(false);
    }
  }
  const cloneTarget =
    mode === "github" ? (selectedRepo?.nameWithOwner ?? "repository") : url.trim() || "repository";

  if (busy) {
    return (
      <>
        <Modal.Header>
          <Modal.Heading>Cloning…</Modal.Heading>
        </Modal.Header>
        <Modal.Body className="flex flex-col items-center justify-center gap-4 px-4 py-12 text-center">
          <PixelLoader size="lg" className="text-foreground" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-foreground">Cloning {cloneTarget}</p>
            <p className="text-xs text-muted">
              Downloading into “{name || "the chosen folder"}”. This can take a moment for large
              repositories.
            </p>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="tertiary" isDisabled isPending>
            Cloning…
          </Button>
        </Modal.Footer>
      </>
    );
  }

  const runtimeLabel = runtimeKey === "native" ? "Native" : runtimeKey;

  return (
    <>
      <Modal.CloseTrigger />
      <Modal.Header>
        <Modal.Heading>Clone a repository</Modal.Heading>
        <p className="mt-1 text-xs text-muted">
          Browse your GitHub repositories or paste a clone URL.
        </p>
      </Modal.Header>
      <Modal.Body className="flex flex-col gap-3 p-4">
        {/* Mode toggle */}
        <div className="inline-flex w-fit gap-1 rounded-lg bg-content2 p-0.5">
          <ModeTab active={mode === "github"} onPress={() => selectMode("github")}>
            <GithubMark className="size-4" />
            GitHub
          </ModeTab>
          <ModeTab active={mode === "url"} onPress={() => selectMode("url")}>
            <Link2 className="size-4" />
            Clone URL
          </ModeTab>
        </div>

        {mode === "github" ? (
          <GitHubBrowser
            accounts={accounts}
            selectedAccount={selectedAccount}
            onSelectAccount={setSelectedAccount}
            repos={repos}
            reposError={reposError}
            filteredRepos={filteredRepos}
            repoSearch={repoSearch}
            onSearch={setRepoSearch}
            selectedRepoId={selectedRepo?.nameWithOwner ?? null}
            onSelectRepo={selectRepo}
            onSwitchToUrl={() => selectMode("url")}
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium text-muted">Repository URL</Label>
            <Input
              aria-label="Repository URL"
              placeholder="https://github.com/owner/repo.git"
              value={url}
              onChange={(e) => changeUrl(e.target.value)}
            />
          </div>
        )}

        {/* Runtime (WSL only) */}
        {showRuntime ? (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium text-muted">Runtime</Label>
            <Dropdown>
              <Button aria-label="Runtime" variant="tertiary" className="justify-between">
                <span className="flex items-center gap-2">
                  {runtimeKey === "native" ? (
                    <Monitor className="size-4 text-muted" />
                  ) : (
                    <TuxIcon className="size-4 text-muted" />
                  )}
                  {runtimeLabel}
                </span>
                <ChevronDown className="size-3.5 text-muted/60" />
              </Button>
              <Dropdown.Popover className="min-w-[--trigger-width]">
                <Dropdown.Menu
                  aria-label="Runtime options"
                  selectionMode="single"
                  selectedKeys={[runtimeKey]}
                  onAction={(key) => setRuntimeKey(String(key))}
                >
                  <Dropdown.Item id="native" textValue="Native">
                    <Monitor className="size-4 shrink-0 text-muted" />
                    <Label>Native</Label>
                  </Dropdown.Item>
                  {distros.map((distro) => (
                    <Dropdown.Item key={distro} id={distro} textValue={distro}>
                      <TuxIcon className="size-4 shrink-0 text-muted" />
                      <Label>{distro}</Label>
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          </div>
        ) : null}

        {/* Folder name */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-muted">Folder name</Label>
          <Input
            aria-label="Folder name"
            placeholder="repository"
            value={name}
            onChange={(e) => {
              nameTouched.current = true;
              setName(e.target.value);
            }}
          />
        </div>

        {/* Location */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-muted">Location</Label>
          <Button
            aria-label="Browse for parent folder"
            variant="tertiary"
            className="w-full justify-start gap-2 font-normal"
            onPress={() => void handleBrowse()}
          >
            <FolderOpen className="size-4 shrink-0 text-muted" />
            {pickerLeaf ? (
              <span className="flex min-w-0 flex-1 items-center text-left">
                <span className="truncate">{pickerLeaf.head}</span>
                <span className="shrink-0">{pickerLeaf.tail}</span>
              </span>
            ) : (
              <span className="flex-1 text-left text-muted">Choose a folder…</span>
            )}
          </Button>
        </div>

        {inlineError ? <p className="text-xs text-danger">{inlineError}</p> : null}
      </Modal.Body>
      <Modal.Footer>
        <Button slot="close" variant="ghost" className="text-muted">
          Cancel
        </Button>
        <Button
          variant="tertiary"
          isDisabled={!!validationError}
          onPress={() => void handleSubmit()}
        >
          Clone
        </Button>
      </Modal.Footer>
    </>
  );
}

function ModeTab(props: { active: boolean; onPress: () => void; children: ReactNode }) {
  return (
    <Button
      size="sm"
      variant={props.active ? "tertiary" : "ghost"}
      className={`gap-1.5 ${props.active ? "" : "text-muted"}`}
      onPress={props.onPress}
    >
      {props.children}
    </Button>
  );
}

function GitHubBrowser(props: {
  accounts: GitHubAccount[] | null;
  selectedAccount: GitHubAccount | null;
  onSelectAccount: (account: GitHubAccount) => void;
  repos: GitHubRepoSummary[] | null;
  reposError: string | null;
  filteredRepos: GitHubRepoSummary[];
  repoSearch: string;
  onSearch: (value: string) => void;
  selectedRepoId: string | null;
  onSelectRepo: (repo: GitHubRepoSummary) => void;
  onSwitchToUrl: () => void;
}) {
  const { accounts, selectedAccount } = props;

  if (accounts === null) {
    return <p className="text-xs text-muted">Loading accounts…</p>;
  }

  if (accounts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-default-300 p-3 text-xs text-muted">
        No GitHub CLI accounts found. Sign in with{" "}
        <code className="rounded bg-content2 px-1 py-0.5">gh auth login</code>, or{" "}
        <button
          type="button"
          className="text-accent underline-offset-2 hover:underline"
          onClick={props.onSwitchToUrl}
        >
          paste a clone URL
        </button>
        .
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {accounts.length > 1 ? (
        <Dropdown>
          <Button aria-label="Account" variant="tertiary" className="justify-between">
            <span className="flex items-center gap-2">
              <GithubMark className="size-4 text-muted" />
              {selectedAccount?.login ?? "Select account"}
            </span>
            <ChevronDown className="size-3.5 text-muted/60" />
          </Button>
          <Dropdown.Popover className="min-w-[--trigger-width]">
            <Dropdown.Menu
              aria-label="Account options"
              selectionMode="single"
              selectedKeys={
                selectedAccount ? [`${selectedAccount.host}\n${selectedAccount.login}`] : []
              }
              onAction={(key) => {
                const [host, login] = String(key).split("\n");
                const next = accounts.find((a) => a.host === host && a.login === login);
                if (next) props.onSelectAccount(next);
              }}
            >
              {accounts.map((account) => (
                <Dropdown.Item
                  key={`${account.host}\n${account.login}`}
                  id={`${account.host}\n${account.login}`}
                  textValue={account.login}
                >
                  <GithubMark className="size-4 shrink-0 text-muted" />
                  <Label>{account.login}</Label>
                  <span className="ml-auto text-[10px] text-muted/70">{account.host}</span>
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      ) : (
        <div className="flex items-center gap-2 text-xs text-muted">
          <GithubMark className="size-4" />
          <span className="font-medium text-foreground">{selectedAccount?.login}</span>
        </div>
      )}

      <div className="relative w-full">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-3.5 -translate-y-1/2 text-muted" />
        <Input
          aria-label="Search repositories"
          placeholder="Search repositories…"
          value={props.repoSearch}
          onChange={(e) => props.onSearch(e.target.value)}
          className="w-full pl-8"
        />
      </div>

      <RepoList
        repos={props.repos}
        reposError={props.reposError}
        filteredRepos={props.filteredRepos}
        selectedRepoId={props.selectedRepoId}
        onSelectRepo={props.onSelectRepo}
      />
    </div>
  );
}

function RepoList(props: {
  repos: GitHubRepoSummary[] | null;
  reposError: string | null;
  filteredRepos: GitHubRepoSummary[];
  selectedRepoId: string | null;
  onSelectRepo: (repo: GitHubRepoSummary) => void;
}) {
  if (props.reposError) {
    return (
      <div className="rounded-lg border border-default-200 p-3 text-xs text-danger">
        {props.reposError}
      </div>
    );
  }

  if (props.repos === null) {
    return (
      <div className="flex items-center justify-center px-1 py-10">
        <PixelLoader size="md" className="text-muted" />
      </div>
    );
  }

  if (props.filteredRepos.length === 0) {
    return (
      <p className="px-1 py-10 text-center text-xs text-muted">
        {props.repos.length === 0 ? "No repositories found." : "No matches."}
      </p>
    );
  }

  return (
    <div className="-mr-1 flex max-h-60 flex-col gap-0.5 overflow-y-auto pr-1">
      {props.filteredRepos.map((repo) => {
        const selected = repo.nameWithOwner === props.selectedRepoId;
        return (
          <button
            key={repo.nameWithOwner}
            type="button"
            onClick={() => props.onSelectRepo(repo)}
            className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
              selected
                ? "bg-[var(--row-active)] text-foreground"
                : "text-foreground/85 hover:bg-[var(--row-hover)] hover:text-foreground"
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium">{repo.nameWithOwner}</span>
                {repo.isPrivate ? <Lock className="size-3 shrink-0 text-muted" /> : null}
              </div>
              {/* Keep every row two lines tall so the list reads like the sidebar. */}
              <p className="truncate text-xs text-muted">{repo.description || "No description"}</p>
            </div>
            {repo.pushedAt ? (
              <span className="mt-0.5 shrink-0 text-[10px] text-muted/70">
                {formatRelativeTime(repo.pushedAt)}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
