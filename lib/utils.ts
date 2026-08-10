// lib/utils.ts — shadcn/ui's standard `cn()` classname helper (clsx + tailwind-merge).
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
