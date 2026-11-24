import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        fact: "#22c55e",
        inference: "#eab308",
        hypothesis: "#ef4444",
        panel: "#111826",
        border: "#1f2a3a",
        bg: "#0b0f14",
      },
    },
  },
  plugins: [],
};

export default config;
