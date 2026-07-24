import { useTheme } from "./ThemeContext";

// Declares `theme` too — same name as the provider's useState binding.
// Realistic, and exactly the ambiguity the tracer must not resolve silently.
export function ThemedPanel() {
  const theme = useTheme();
  return <div className={theme} />;
}
