import type * as React from "react";

import { cn } from "../cn.js";

function Checkbox({ className, ...props }: React.ComponentProps<"input">) {
	return (
		<input
			type="checkbox"
			className={cn("block size-4 rounded border-input accent-primary cursor-pointer", className)}
			{...props}
		/>
	);
}

export { Checkbox };
