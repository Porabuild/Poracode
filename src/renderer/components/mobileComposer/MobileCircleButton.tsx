import type { ButtonProps } from "@heroui/react";
import { Button } from "@heroui/react";

export type MobileCircleButtonProps = Omit<ButtonProps, "className" | "isIconOnly"> & {
  className?: string;
};

/** Shared 44px glass circle used by compact PWA floating and header actions. */
export function MobileCircleButton({
  className = "",
  variant = "ghost",
  ...props
}: MobileCircleButtonProps) {
  return (
    <Button
      {...props}
      isIconOnly
      variant={variant}
      className={`m-home-compose-action poracode-overlay-header__controls ${className}`}
    />
  );
}
