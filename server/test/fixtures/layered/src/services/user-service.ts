// Consumes the barrel through a tsconfig path alias (`@core/*`).
import { buildUrl } from "@core/index";

export function fetchUserPath(id: string): string {
  return buildUrl(`/users/${id}`);
}

export function fetchAdminPath(): string {
  return fetchUserPath("admin");
}
