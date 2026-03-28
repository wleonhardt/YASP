export const QUESTION_MARK_TOKEN = "?";
export const COFFEE_CARD_TOKEN = "☕";

export function isCoffeeCardToken(token: string): boolean {
  return token === COFFEE_CARD_TOKEN;
}

export function getDeckTokenText(token: string): string {
  return isCoffeeCardToken(token) ? "Coffee" : token;
}

export function getDeckTokenAriaLabel(token: string): string {
  return isCoffeeCardToken(token) ? "Coffee break" : token;
}
