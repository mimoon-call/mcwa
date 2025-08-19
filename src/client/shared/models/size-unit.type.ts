export type SizeUnit =
  | `${number}px`
  | `${number}rem`
  | `${number}em`
  | `${number}vh`
  | `${number}vw`
  | `${number}%`
  | `var(--${string})`
  | 'auto'
  | 'fit-content'
  | `calc(${string})`;
