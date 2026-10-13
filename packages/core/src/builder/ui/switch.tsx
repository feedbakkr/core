import type * as React from "react";

import { cn } from "../cn.js";

function Switch({
	className,
	checked,
	onCheckedChange,
	...props
}: Omit<React.ComponentProps<"button">, "role"> & {
	checked?: boolean;
	onCheckedChange?: (checked: boolean) => void;
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			data-state={checked ? "checked" : "unchecked"}
			data-slot="switch"
			className={cn(
				"peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-xs transition-colors outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
				checked ? "bg-primary" : "bg-input",
				className,
			)}
			onClick={() => onCheckedChange?.(!checked)}
			{...props}
		>
			<span
				className={cn(
					"pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
					checked ? "translate-x-4" : "translate-x-0",
				)}
			/>
		</button>
	);
}

export { Switch };
