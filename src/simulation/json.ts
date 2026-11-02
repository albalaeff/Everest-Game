/** Plain data, which JSON keeps whole: what goes into a save, a scenario or a message. */
export type Json =
  | null
  | boolean
  | number
  | string
  | readonly Json[]
  | { readonly [key: string]: Json };
