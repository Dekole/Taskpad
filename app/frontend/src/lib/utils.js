import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export const CATEGORY_COLORS = {
  gray:   { bg: "bg-gray-200",   ring: "ring-gray-400",   label: "Gray" },
  green:  { bg: "bg-green-400",  ring: "ring-green-500",  label: "Green" },
  yellow: { bg: "bg-yellow-300", ring: "ring-yellow-500", label: "Yellow" },
  red:    { bg: "bg-red-400",    ring: "ring-red-500",    label: "Red" },
};

export const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";
