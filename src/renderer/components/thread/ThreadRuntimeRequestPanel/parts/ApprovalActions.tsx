import type { ReactNode } from "react";
import { Button, Dropdown, Label } from "@heroui/react";
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
        <Button
          key={option.optionId}
          size="sm"
          isDisabled={isDisabled}
          variant="ghost"
          className={negativeButtonClassName}
          onPress={() => onSelect(option.optionId)}
        >
          {option.label}
        </Button>
      ))}
      {primary ? (
        <Button
          size="sm"
          variant="tertiary"
          isDisabled={isDisabled}
          className={buttonClassName}
          onPress={() => onSelect(primary.optionId)}
        >
          {primary.label}
        </Button>
      ) : null}
      {showAllOptions
        ? positiveAlternates.map((option) => (
            <Button
              key={option.optionId}
              size="sm"
              variant="tertiary"
              isDisabled={isDisabled}
              className={buttonClassName}
              onPress={() => onSelect(option.optionId)}
            >
              {option.label}
            </Button>
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
