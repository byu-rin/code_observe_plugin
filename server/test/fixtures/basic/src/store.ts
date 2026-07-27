// Pure-TS fixture: a value declared here and consumed across files.
export const initialCount = 42;

export function makeCounter(): () => number {
  let value = initialCount; // reference #1 (same file)
  return () => value++;
}
