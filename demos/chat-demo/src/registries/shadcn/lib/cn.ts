/**
 * `cn` — the shadcn/ui class-name merge helper.
 *
 * Combines `clsx` (conditional class composition) with `tailwind-merge`
 * (last-wins conflict resolution for Tailwind utilities). This is the standard
 * util every vendored shadcn primitive depends on.
 */
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
