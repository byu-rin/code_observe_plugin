import { createContext, useContext, useState } from "react";

// Context definition, its provider, and a consumer hook.
export const ThemeContext = createContext("light");

export function ThemeProvider({ children }: { children: unknown }) {
  const [theme] = useState("dark");
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const activeTheme = useContext(ThemeContext);
  return activeTheme;
}
