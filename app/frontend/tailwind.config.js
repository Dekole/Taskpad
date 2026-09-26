/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        category: {
          gray: "#9ca3af",
          green: "#22c55e",
          yellow: "#eab308",
          red: "#ef4444",
        },
      },
    },
  },
  plugins: [],
};
