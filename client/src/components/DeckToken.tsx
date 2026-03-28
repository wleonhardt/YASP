import type { ReactNode } from "react";
import { CoffeeIcon } from "./icons/CoffeeIcon";
import { isCoffeeCardToken } from "../lib/deckTokens";

type Props = {
  token: string;
  className?: string;
  variant?: "inline" | "card";
  coffeeText?: ReactNode;
};

export function DeckToken({ token, className, variant = "inline", coffeeText = "Coffee" }: Props) {
  if (!isCoffeeCardToken(token)) {
    return <span className={className}>{token}</span>;
  }

  return (
    <span className={["deck-token", `deck-token--${variant}`, className ?? ""].filter(Boolean).join(" ")}>
      <CoffeeIcon className="deck-token__icon" aria-hidden="true" />
      <span className="deck-token__text">{coffeeText}</span>
    </span>
  );
}
