// Tailwind CSS v4 ships its PostCSS plugin in a dedicated package; the
// `tailwindcss` package is no longer a PostCSS plugin itself.
export default {
  plugins: {
    '@tailwindcss/postcss': {},
    autoprefixer: {},
  },
};
