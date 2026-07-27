import { Counter } from "./Counter";
import { ThemeProvider } from "./ThemeContext";

export function App() {
  return (
    <ThemeProvider>
      <Counter />
    </ThemeProvider>
  );
}
