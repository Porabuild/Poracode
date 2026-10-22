import { useId, type ReactNode } from "react";
import { Button, Dropdown, Label, Tooltip } from "@heroui/react";
import { ChevronDown } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import type { CanonicalRequestType, UserInputOption } from "@/shared/contracts";
import { isNegativeOption } from "../helpers";

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
    ? "flex items-center gap-1 @max-[44rem]:flex-col @max-[44rem]:items-stretch"
    : "flex items-center gap-1";
  const negativeButtonClassName = stackOnNarrow ? "text-muted @max-[44rem]:w-full" : "text-muted";
  const buttonClassName = stackOnNarrow ? "@max-[44rem]:w-full" : "";

  if (!primary && negatives.length === 0) return null;

  return (
    <div className={rootClassName}>
      {leadingAction}
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
      {showAllOptions
        ? positiveAlternates.map((option) => (
            <ApprovalOptionButton
              key={option.optionId}
              option={option}
              variant="tertiary"
              isDisabled={isDisabled}
              className={buttonClassName}
              onSelect={onSelect}
            />
          ))
        : null}
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
  variant: "ghost" | "tertiary";
  isDisabled: boolean;
  className: string;
  onSelect: (optionId: string) => void;
}) {
  const { option, variant, isDisabled, className, onSelect } = props;
  const descriptionId = useId();
  const button = (
    <Button
      size="sm"
      variant={variant}
      isDisabled={isDisabled}
      className={className}
      {...(option.description ? { "aria-describedby": descriptionId } : {})}
      onPress={() => onSelect(option.optionId)}
    >
      {option.label}
    </Button>
  );
  if (!option.description) return button;
  return (
    <Tooltip delay={400}>
      {button}
      <span id={descriptionId} hidden>
        {option.description}
      </span>
      <Tooltip.Content
        placement="top"
        className="max-w-[28rem] whitespace-pre-wrap break-words text-xs"
      >
        {option.description}
      </Tooltip.Content>
    </Tooltip>
  );
}
