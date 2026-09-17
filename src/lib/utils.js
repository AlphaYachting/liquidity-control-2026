import { clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Die eigenen Schriftrollen müssen tailwind-merge bekannt sein, sonst gilt
// "text-meta" als Konflikt zu "text-muted-foreground" und eine davon fällt weg.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['page', 'kpi', 'object', 'value', 'body', 'meta', 'label', 'section'] }],
    },
  },
})

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export const isIframe = window.self !== window.top;