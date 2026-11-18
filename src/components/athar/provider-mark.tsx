import anthropic from "@lobehub/icons-static-svg/icons/anthropic.svg?raw";
import google from "@lobehub/icons-static-svg/icons/google.svg?raw";
import groq from "@lobehub/icons-static-svg/icons/groq.svg?raw";
import openai from "@lobehub/icons-static-svg/icons/openai.svg?raw";
import openrouter from "@lobehub/icons-static-svg/icons/openrouter.svg?raw";

import { cn } from "@/lib/utils";
import type { Provider } from "#/shared/providers";

// Each AI provider's own mark, from Lobe Icons (https://github.com/lobehub/lobe-icons, MIT), in the one-colour
// version so it takes the text colour in both themes. The SVG is inlined; nothing is fetched at run time.
const MARK: Record<Provider, string> = { openrouter, groq, openai, anthropic, google };

export function ProviderMark({ provider, className }: { provider: Provider; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("grid size-5 shrink-0 place-items-center text-ink [&>svg]:size-full", className)}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: static SVG from an installed package, not user content.
      dangerouslySetInnerHTML={{ __html: MARK[provider] }}
    />
  );
}
