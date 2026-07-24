import { initialCount, makeCounter } from "./store"; // import reference

const counter = makeCounter();

export function report(): string {
  // cross-file reference to initialCount
  return `start=${initialCount}, next=${counter()}`;
}
