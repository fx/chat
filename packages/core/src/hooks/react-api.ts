/**
 * The React API the hooks are written against, as a type only: the hooks
 * take a React instance rather than importing one, so a host can hand in its
 * own (a terminal host shares React with the tool that loads it).
 */
export type ReactApi = typeof import('react')
