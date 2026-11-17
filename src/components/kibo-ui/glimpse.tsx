// Vendored from Kibo UI Glimpse (https://www.kibo-ui.com/components/glimpse): a hover link preview built on shadcn
// HoverCard. Kept to the parts Athar uses; the import of cn points at the project's own helper.
import type { ComponentProps } from 'react'

import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'

export type GlimpseProps = ComponentProps<typeof HoverCard>
export const Glimpse = (props: GlimpseProps) => <HoverCard {...props} />

export type GlimpseContentProps = ComponentProps<typeof HoverCardContent>
export const GlimpseContent = (props: GlimpseContentProps) => <HoverCardContent {...props} />

export type GlimpseTriggerProps = ComponentProps<typeof HoverCardTrigger>
export const GlimpseTrigger = (props: GlimpseTriggerProps) => <HoverCardTrigger {...props} />
