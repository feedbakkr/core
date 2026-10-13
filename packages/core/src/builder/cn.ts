// FeedBakkr's `cn` (apps/app/app/lib/utils.ts). clsx and tailwind-merge are
// bundled into the builder, so they are not dependencies of the package.
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
