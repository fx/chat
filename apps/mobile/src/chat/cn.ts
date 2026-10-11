/**
 * `cn` — registry-agnostic class-name merge helper.
 *
 * Combines `clsx` (conditional class composition) with `tailwind-merge`
 * (last-wins conflict resolution for Tailwind utilities). Lives in `shared/` so
 * registry-agnostic slots (markdown, code) don't have to reach into any single
 * registry (e.g. shadcn) for it. Each registry's own util re-exports this one,
 * so there is exactly one `cn` implementation across the demo.
 */
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
