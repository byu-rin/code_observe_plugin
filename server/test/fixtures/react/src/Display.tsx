// Leaf component: receives state through a prop.
export function Display({ count }: { count: number }) {
  return <span>{count}</span>;
}
