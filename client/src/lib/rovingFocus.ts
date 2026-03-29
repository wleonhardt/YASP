export function getNextRovingValue<T extends string>(
  values: readonly T[],
  current: T,
  key: string
): T | null {
  const currentIndex = values.indexOf(current);
  if (currentIndex === -1 || values.length === 0) {
    return null;
  }

  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return values[(currentIndex + 1) % values.length];
    case "ArrowLeft":
    case "ArrowUp":
      return values[(currentIndex - 1 + values.length) % values.length];
    case "Home":
      return values[0];
    case "End":
      return values[values.length - 1];
    default:
      return null;
  }
}
