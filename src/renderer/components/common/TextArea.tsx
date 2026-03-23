import { TextArea as HeroTextArea, type TextAreaProps as HeroTextAreaProps } from "@heroui/react";

export type TextAreaProps = HeroTextAreaProps;

export function TextArea(props: TextAreaProps) {
  return <HeroTextArea {...props} />;
}
