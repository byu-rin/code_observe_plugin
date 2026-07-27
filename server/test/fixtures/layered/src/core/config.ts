// Origin of the value. Reached through a barrel and a path alias.
export const API_BASE = "https://api.example.com";

export function buildUrl(path: string): string {
  return `${API_BASE}${path}`;
}
