/**
 * `cn` — the shadcn/ui class-name merge helper.
 *
 * Combines `clsx` (conditional class composition) with `tailwind-merge`
 * (last-wins conflict resolution for Tailwind utilities) — the helper shadcn/ui
 * primitives conventionally import.
 */
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
