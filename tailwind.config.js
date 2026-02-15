/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./index.html", "./enhanced-app.jsx", "./public/enhanced-app.js"],
    theme: {
        extend: {
            fontFamily: {
                sans: ["Inter", "system-ui", "sans-serif"],
                brand: ["Inter", "system-ui", "sans-serif"],
                mono: ["JetBrains Mono", "monospace"],
            },
            colors: {
                arena: {
                    bg: "#101014",
                    sidebar: "#14141c",
                    card: "#19191f",
                    border: "#1e1e26",
                    hover: "#1c1c24",
                    input: "#16161c",
                },
            },
        },
    },
    plugins: [],
};
