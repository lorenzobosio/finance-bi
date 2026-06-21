import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

// Tailwind class-merge helper shared by shadcn/ui (`cn`) and Tremor Raw (`cx`).
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Tremor Raw blocks import this util as `cx`; alias it to the same implementation
// so copy-pasted Tremor Raw components work without modification (FND-06).
export const cx = cn
