import { useId, type ReactNode } from "react";
import { Button, Dropdown, Label, Tooltip } from "@heroui/react";
import { ChevronDown } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { CanonicalRequestType, UserInputOption } from "@/shared/contracts";
import { isNegativeOption } from "../helpers";
import { handleOptionKey } from "../optionKeyboard";
import { QuestionRowMarker } from "./QuestionOptionRow";
import { useOverflowTooltip } from "./useOverflowTooltip";

export function ApprovalActions(props: {
  options: readonly UserInputOption[];
  requestType: CanonicalRequestType;
  isDisabled: boolean;
  leadingAction?: ReactNode;
  showAllOptions?: boolean;
  stackOnNarrow?: boolean;
  onSelect: (optionId: string) => void;
}) {
  const { options, isDisabled, leadingAction, showAllOptions, stackOnNarrow, onSelect } = props;
  const { t } = useLingui();
  const negatives = options.filter(isNegativeOption);
  const positives = options.filter((o) => !isNegativeOption(o));
  const primary = positives[0];
  const positiveAlternates = positives.slice(1);
  const rootClassName = stackOnNarrow
    ? "flex flex-wrap items-center gap-1 @max-[44rem]:flex-col @max-[44rem]:items-stretch"
    : "flex flex-wrap items-center gap-1";
  // Scope labels can carry long paths; cap each button and truncate its label
  // so one option cannot push the row past the panel. The tooltip shows the rest.
  const capClassName = stackOnNarrow
    ? "max-w-[min(100%,28rem)] @max-[44rem]:max-w-full"
    : "max-w-[min(100%,28rem)]";
  const negativeButtonClassName = stackOnNarrow
    ? `${capClassName} text-muted @max-[44rem]:w-full`
    : `${capClassName} text-muted`;
  const buttonClassName = stackOnNarrow ? `${capClassName} @max-[44rem]:w-full` : capClassName;

  if (!primary && negatives.length === 0) return null;

  return (
    <div
      className={rootClassName}
      onKeyDownCapture={(event) => {
        if (showAllOptions && !isDisabled)
          handleOptionKey(event, event.currentTarget, "[data-approval-option]");
      }}
    >
      {leadingAction}
      {showAllOptions ? (
        options.map((option, index) => (
          <ApprovalOptionButton
            key={option.optionId}
            option={option}
            index={index}
            isDisabled={isDisabled}
            variant={isNegativeOption(option) ? "ghost" : "tertiary"}
            className={isNegativeOption(option) ? negativeButtonClassName : buttonClassName}
            onSelect={onSelect}
          />
        ))
      ) : (
        <>
          {negatives.map((option) => (
            <ApprovalOptionButton
              key={option.optionId}
              option={option}
              isDisabled={isDisabled}
              variant="ghost"
              className={negativeButtonClassName}
              onSelect={onSelect}
            />
          ))}
          {primary ? (
            <ApprovalOptionButton
              option={primary}
              variant="tertiary"
              isDisabled={isDisabled}
              className={buttonClassName}
              onSelect={onSelect}
            />
          ) : null}
        </>
      )}
      {primary && positiveAlternates.length > 0 && !showAllOptions ? (
        <Dropdown>
          <Button
            size="sm"
            variant="tertiary"
            isIconOnly
            aria-label={t`More approval options`}
            isDisabled={isDisabled}
          >
            <ChevronDown className="size-3.5" />
          </Button>
          <Dropdown.Popover placement="top end">
            <Dropdown.Menu onAction={(key) => onSelect(String(key))}>
              {positiveAlternates.map((option) => (
                <Dropdown.Item key={option.optionId} id={option.optionId} textValue={option.label}>
                  <Label>{option.label}</Label>
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      ) : null}
    </div>
  );
}

function ApprovalOptionButton(props: {
  option: UserInputOption;
  index?: number;
  variant: "ghost" | "tertiary";
  isDisabled: boolean;
  className: string;
  onSelect: (optionId: string) => void;
}) {
  const { option, index, variant, isDisabled, className, onSelect } = props;
  const descriptionId = useId();
  const { labelRef, labelOverflows, tooltipProps } = useOverflowTooltip(!!option.description);
  return (
    <Tooltip delay={400} {...tooltipProps}>
      <Button
        size="sm"
        variant={variant}
        isDisabled={isDisabled}
        className={className}
        {...(index !== undefined ? { "data-approval-option": true } : {})}
        ref={(element) => {
          // React Aria filters aria-keyshortcuts out of Button props.
          if (index !== undefined && index < 9)
            element?.setAttribute("aria-keyshortcuts", String(index + 1));
          else element?.removeAttribute("aria-keyshortcuts");
        }}
        {...(option.description ? { "aria-describedby": descriptionId } : {})}
        onPress={() => onSelect(option.optionId)}
      >
        {index !== undefined ? (
          <QuestionRowMarker active={false}>{index + 1}</QuestionRowMarker>
        ) : null}
        <span ref={labelRef} className="min-w-0 truncate">
          {option.label}
        </span>
      </Button>
      {option.description ? (
        <span id={descriptionId} hidden>
          {option.description}
        </span>
      ) : null}
      <Tooltip.Content placement="top" className="pointer-events-none max-w-[28rem] text-xs">
        <div className="space-y-1 whitespace-pre-wrap [overflow-wrap:anywhere]">
          {labelOverflows ? (
            <div className="font-medium text-foreground">{option.label}</div>
          ) : null}
          {option.description ? (
            <div className="text-[11px] text-[color:var(--muted)]">{option.description}</div>
          ) : null}
        </div>
      </Tooltip.Content>
    </Tooltip>
  );
}
