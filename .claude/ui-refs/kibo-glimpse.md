# Kibo UI Glimpse (pulled 2026-11-17 from https://www.kibo-ui.com/components/glimpse)
Install: `bunx shadcn@latest add https://www.kibo-ui.com/r/glimpse.json`
Dependencies: [] ['hover-card']

```tsx
"use client";

import { cn } from "@repo/shadcn-ui/lib/utils";
import type { ComponentProps } from "react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

export type GlimpseProps = ComponentProps<typeof HoverCard>;

export const Glimpse = (props: GlimpseProps) => {
  return <HoverCard {...props} />;
};

export type GlimpseContentProps = ComponentProps<typeof HoverCardContent>;

export const GlimpseContent = (props: GlimpseContentProps) => (
  <HoverCardContent {...props} />
);

export type GlimpseTriggerProps = ComponentProps<typeof HoverCardTrigger>;

export const GlimpseTrigger = (props: GlimpseTriggerProps) => (
  <HoverCardTrigger {...props} />
);

export type GlimpseTitleProps = ComponentProps<"p">;

export const GlimpseTitle = ({ className, ...props }: GlimpseTitleProps) => {
  return (
    <p className={cn("truncate font-semibold text-sm", className)} {...props} />
  );
};

export type GlimpseDescriptionProps = ComponentProps<"p">;

export const GlimpseDescription = ({
  className,
  ...props
}: GlimpseDescriptionProps) => {
  return (
    <p
      className={cn("line-clamp-2 text-muted-foreground text-sm", className)}
      {...props}
    />
  );
};

export type GlimpseImageProps = ComponentProps<"img">;

export const GlimpseImage = ({
  className,
  alt,
  ...props
}: GlimpseImageProps) => (
  // biome-ignore lint/performance/noImgElement: "Kibo UI is framework agnostic"
  <img
    alt={alt ?? ""}
    className={cn(
      "mb-4 aspect-[120/63] w-full rounded-md border object-cover",
      className
    )}
    {...props}
  />
);

```
```tsx
const TITLE_REGEX = /<title[^>]*>([^<]+)<\/title>/;
const OG_TITLE_REGEX = /<meta[^>]*property="og:title"[^>]*content="([^"]+)"/;
const DESCRIPTION_REGEX = /<meta[^>]*name="description"[^>]*content="([^"]+)"/;
const OG_DESCRIPTION_REGEX =
  /<meta[^>]*property="og:description"[^>]*content="([^"]+)"/;
const OG_IMAGE_REGEX = /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/;

export const glimpse = async (url: string) => {
  const response = await fetch(url);
  const data = await response.text();
  const titleMatch = data.match(TITLE_REGEX) || data.match(OG_TITLE_REGEX);
  const descriptionMatch =
    data.match(DESCRIPTION_REGEX) || data.match(OG_DESCRIPTION_REGEX);
  const imageMatch = data.match(OG_IMAGE_REGEX);

  return {
    title: titleMatch?.at(1) ?? null,
    description: descriptionMatch?.at(1) ?? null,
    image: imageMatch?.at(1) ?? null,
  };
};

```
