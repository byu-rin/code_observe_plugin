import { useState } from "react";
import { Display } from "./Display";

// useState + setter call site + state crossing into a child via prop.
export function Counter() {
  const [count, setCount] = useState(0);

  function increment() {
    setCount(count + 1);
  }

  return (
    <div>
      <Display count={count} />
      <button onClick={increment}>+</button>
    </div>
  );
}
