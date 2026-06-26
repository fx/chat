/**
 * Vendored shadcn/ui `Tooltip` (Radix Tooltip primitive + styled content).
 */
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { type ComponentPropsWithoutRef, forwardRef } from 'react'
import { cn } from '../lib/cn'

export const TooltipProvider = TooltipPrimitive.Provider
export const Tooltip = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger

export const TooltipContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 overflow-hidden rounded-md border bg-popover px-2.5 py-1 text-xs text-popover-foreground shadow-md',
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = 'TooltipContent'
