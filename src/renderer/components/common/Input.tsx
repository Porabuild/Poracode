import { Input as HeroInput, type InputProps as HeroInputProps } from "@heroui/react";
import type { ButtonProps } from "./Button";

export type InputProps = Omit<HeroInputProps, "size"> & {
  size?: ButtonProps["size"] | HeroInputProps["size"];
};

export function Input({ size = "md", ...props }: InputProps) {
  return (
    <HeroInput
      {...props}
      data-control-size={typeof size === "number" ? "md" : size}
      {...(typeof size === "number" ? { size } : {})}
    />
  );
}
