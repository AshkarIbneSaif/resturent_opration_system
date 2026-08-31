/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        slate: {
          950: "#161A17",
          900: "#1F2420",
          800: "#2A302B",
          700: "#3A423C",
          600: "#525C53",
        },
        paper: "#F2EDE4",
        ember: { DEFAULT: "#E8A33D", dark: "#C4832A" },
        sage: { DEFAULT: "#7FA65C", dark: "#638A45" },
        brick: { DEFAULT: "#C24A3D", dark: "#A13A2F" },
      },
      fontFamily: {
        display: ["'Archivo Black'", "sans-serif"],
        body: ["'IBM Plex Sans'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};
