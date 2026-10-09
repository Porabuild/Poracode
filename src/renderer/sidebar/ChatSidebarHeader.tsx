import { useId, useState } from "react";
import { Button, Dropdown, SearchField } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { ChevronDown, Plus } from "lucide-react";
import { openThread } from "@/renderer/actions/threadActions";
import type { SidebarChatChoice } from "./sidebarChoices";
import { RelativeTime } from "@/renderer/components/common/RelativeTime";

export function ChatSidebarHeader(props: {
  threads: SidebarChatChoice[];
  selected: SidebarChatChoice | undefined;
  onNewChat: () => void;
  /** Disables the picker and New chat while no host project is available. */
  isDisabled?: boolean;
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const menuId = useId();
  const chatsLabelId = useId();
  const titleId = useId();
  const search = query.trim().toLocaleLowerCase();
  const visibleThreads = props.threads.filter((thread) =>
    (thread.title || t`Untitled`).toLocaleLowerCase().includes(search),
  );
  const choose = (key: string) => {
    setOpen(false);
    if (key === "new") props.onNewChat();
    else openThread(key, { standalone: true });
  };
  return (
    <header className="grid shrink-0 grid-cols-[2rem_minmax(0,1fr)_2rem] items-center px-2 py-1">
      <div className="col-start-2 flex min-w-0 justify-center">
        <Dropdown
          isOpen={open}
          onOpenChange={(nextOpen) => {
            setOpen(nextOpen);
            if (nextOpen) setQuery("");
          }}
        >
          <Button
            size="sm"
            variant="ghost"
            className="!h-7 !min-h-7 min-w-0 max-w-full gap-1 px-2 text-xs text-muted"
            aria-labelledby={`${chatsLabelId} ${titleId}`}
            isDisabled={props.isDisabled === true}
          >
            <span id={chatsLabelId} hidden>
              {t`Chats`}
            </span>
            <span id={titleId} className="truncate">
              {props.selected?.title || (props.selected ? t`Untitled` : t`New chat`)}
            </span>
            <ChevronDown className="size-3 shrink-0" />
          </Button>
          <Dropdown.Popover
            placement="bottom"
            className="flex w-72 max-w-[calc(100vw-2rem)] !max-h-[min(20rem,60vh)] flex-col !overflow-hidden"
          >
            <SearchField
              aria-label={t`Search recent chats`}
              value={query}
              onChange={setQuery}
              variant="secondary"
              className="shrink-0 border-b border-border/50 px-1 pt-1"
            >
              <SearchField.Group className="!h-7 !min-h-7 !rounded-none !bg-transparent !shadow-none">
                <SearchField.SearchIcon className="size-3 text-muted" />
                <SearchField.Input
                  autoFocus // eslint-disable-line jsx-a11y/no-autofocus -- user-opened chat picker, expected search focus
                  placeholder={t`Search recent chats`}
                  className="min-w-0 !text-xs"
                  aria-controls={menuId}
                  onKeyDown={(event) => {
                    // Same contract as the model menu search: arrows reach the
                    // list, Enter picks the first match without leaving search.
                    if (event.key === "Enter") {
                      event.preventDefault();
                      choose(search ? (visibleThreads[0]?.id ?? "new") : "new");
                      return;
                    }
                    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                    const items = document
                      .getElementById(menuId)
                      ?.querySelectorAll<HTMLElement>('[role="menuitem"]');
                    if (!items?.length) return;
                    event.preventDefault();
                    items[event.key === "ArrowDown" ? 0 : items.length - 1]?.focus();
                  }}
                />
                <SearchField.ClearButton aria-label={t`Clear search`} />
              </SearchField.Group>
            </SearchField>
            <Dropdown.Menu
              id={menuId}
              autoFocus={false}
              aria-label={t`Chats`}
              selectionMode="none"
              className="poracode-menu min-h-0 overflow-y-auto"
              onAction={(key) => {
                if (typeof key === "string") choose(key);
              }}
            >
              <Dropdown.Item id="new" textValue={t`New chat`} className="!min-h-7">
                {t`New chat`}
              </Dropdown.Item>
              {visibleThreads.map((thread) => (
                <Dropdown.Item
                  key={thread.id}
                  id={thread.id}
                  textValue={thread.title || t`Untitled`}
                  className="!min-h-7"
                >
                  <span className="min-w-0 flex-1 truncate">{thread.title || t`Untitled`}</span>
                  <RelativeTime
                    iso={thread.updatedAt}
                    className="shrink-0 font-mono text-[10px] text-muted tabular-nums"
                  />
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
            {search && visibleThreads.length === 0 ? (
              <p role="status" className="px-3 py-2 text-xs text-muted">
                {t`No results`}
              </p>
            ) : null}
          </Dropdown.Popover>
        </Dropdown>
      </div>
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        className="!size-7 !min-h-7 !min-w-7 justify-self-center"
        aria-label={t`New chat`}
        isDisabled={props.isDisabled === true}
        onPress={props.onNewChat}
      >
        <Plus className="size-4 text-muted" />
      </Button>
    </header>
  );
}
