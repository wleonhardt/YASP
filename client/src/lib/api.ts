import type { PublicConfig } from "@yasp/shared";

export async function fetchConfig(): Promise<PublicConfig> {
  const res = await fetch("/api/config");
  if (!res.ok) throw new Error("Failed to fetch config");
  return res.json();
}
