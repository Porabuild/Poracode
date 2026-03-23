import {
  Card as HeroCard,
  type CardContentProps as HeroCardContentProps,
  type CardDescriptionProps as HeroCardDescriptionProps,
  type CardFooterProps as HeroCardFooterProps,
  type CardHeaderProps as HeroCardHeaderProps,
  type CardProps as HeroCardProps,
  type CardTitleProps as HeroCardTitleProps,
} from "@heroui/react";

export type CardProps = HeroCardProps;
export type CardHeaderProps = HeroCardHeaderProps;
export type CardTitleProps = HeroCardTitleProps;
export type CardDescriptionProps = HeroCardDescriptionProps;
export type CardContentProps = HeroCardContentProps;
export type CardFooterProps = HeroCardFooterProps;

export function Card(props: CardProps) {
  return <HeroCard {...props} />;
}

export function CardHeader(props: CardHeaderProps) {
  return <HeroCard.Header {...props} />;
}

export function CardTitle(props: CardTitleProps) {
  return <HeroCard.Title {...props} />;
}

export function CardDescription(props: CardDescriptionProps) {
  return <HeroCard.Description {...props} />;
}

export function CardContent(props: CardContentProps) {
  return <HeroCard.Content {...props} />;
}

export function CardFooter(props: CardFooterProps) {
  return <HeroCard.Footer {...props} />;
}
