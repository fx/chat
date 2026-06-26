/**
 * Vendored shadcn/ui `Avatar` (Radix Avatar primitive + fallback).
 */
import * as AvatarPrimitive from '@radix-ui/react-avatar'
import { type ComponentPropsWithoutRef, forwardRef } from 'react'
import { cn } from '../lib/cn'

export const Avatar = forwardRef<
  HTMLSpanElement,
  ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn('relative flex h-7 w-7 shrink-0 overflow-hidden rounded-full', className)}
    {...props}
  />
))
Avatar.displayName = 'Avatar'

export const AvatarFallback = forwardRef<
  HTMLSpanElement,
  ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      'flex h-full w-full items-center justify-center rounded-full bg-muted text-xs font-medium',
      className,
    )}
    {...props}
  />
))
AvatarFallback.displayName = 'AvatarFallback'
