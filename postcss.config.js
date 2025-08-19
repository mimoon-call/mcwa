// postcss.config.js
import tailwindcss from 'tailwindcss';
import postcssNesting from 'postcss-nesting';
import autoprefixer from 'autoprefixer';

export default {
  plugins: [postcssNesting(), tailwindcss, autoprefixer()],
};
