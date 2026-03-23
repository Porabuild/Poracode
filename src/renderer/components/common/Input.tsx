import { Input as HeroInput, type InputProps as HeroInputProps } from "@heroui/react";

export type InputProps = HeroInputProps;

export function Input(props: InputProps) {
  return <HeroInput {...props} />;
}
