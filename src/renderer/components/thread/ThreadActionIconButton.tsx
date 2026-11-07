import { Button, type ButtonProps } from "@heroui/react";

export function ThreadActionIconButton({ className, ...props }: ButtonProps) {
  return (
    <Button
      {...props}
      isIconOnly
      size="sm"
      variant="ghost"
      className={`poracode-overlay-header__controls size-6 min-w-0 shrink-0 rounded p-0 hover:bg-[var(--row-hover)] ${className ?? ""}`}
    />
  );
}
