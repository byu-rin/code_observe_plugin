// Entry point: app → services → core (barrel) → config
import { fetchAdminPath } from "./services/user-service";

export function main(): string {
  return fetchAdminPath();
}
