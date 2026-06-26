/**
 * `cn` — the shadcn/ui class-name merge helper.
 *
 * shadcn primitives conventionally import `cn` from `lib/cn`, so this path is
 * kept as the registry-local entry point. The implementation itself lives in
 * the registry-agnostic `shared/cn` (so shared slots don't depend on shadcn);
 * this module just re-exports it to keep a single `cn` across the demo.
 */
export { cn } from '../../shared/cn'
