/**
 * Design tokens for the INITE auth frontend.
 *
 * Defined once so `Button`, `Card`, etc. can share them and so that
 * a brand refresh is a one-file change. NOT for use in arbitrary
 * Tailwind classes — only the design-system primitives should pull
 * from here; product code uses the primitives.
 *
 * Why TS const-objects and not CSS variables: we get TS autocomplete
 * + IntelliSense over typo-prone string literals, and Tailwind JIT
 * still inlines the resulting classes at build time.
 */

export const gradients = {
  /** Primary brand: violet → fuchsia. Use for marquee CTAs only. */
  primary: 'from-violet-500 to-fuchsia-500',
  primaryHover: 'hover:from-violet-600 hover:to-fuchsia-600',
  /** Secondary brand: violet → purple. Slightly less saturated. */
  secondary: 'from-violet-500 to-purple-600',
  secondaryHover: 'hover:from-violet-600 hover:to-purple-700',
  /** Danger: red → rose. */
  danger: 'from-red-500 to-rose-600',
  dangerHover: 'hover:from-red-600 hover:to-rose-700',
  /** Success surfaces: green → emerald. */
  success: 'from-green-500 to-emerald-500',
} as const

export const shadows = {
  /** Subtle elevation for cards inside dense lists. */
  card: 'shadow-lg',
  /** Standalone cards / modals — the page's primary surface. */
  cardLifted: 'shadow-2xl',
  /** Buttons: rest. */
  button: 'shadow-md',
  /** Buttons: hover. */
  buttonHover: 'hover:shadow-lg',
} as const

export const radii = {
  /** Inputs, small buttons. */
  control: 'rounded-lg',
  /** Cards and primary buttons. */
  surface: 'rounded-xl',
  /** Hero surfaces, modals. */
  hero: 'rounded-2xl',
} as const

export const motion = {
  /** Standard entrance: fade + slide up. */
  enter: { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } },
  /** Quick fade — for small inline elements. */
  fade: { initial: { opacity: 0 }, animate: { opacity: 1 } },
  /** Pop-in for badges / icons. */
  pop: {
    initial: { scale: 0.95, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    transition: { type: 'spring' as const, stiffness: 260, damping: 22 },
  },
} as const

export const focusRing =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900'
