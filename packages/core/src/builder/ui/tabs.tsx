import type * as React from "react";
import { createContext, useContext, useState } from "react";

import { cn } from "../cn.js";

interface TabsContextValue {
	value: string;
	setValue: (value: string) => void;
}

const TabsContext = createContext<TabsContextValue>({
	value: "",
	setValue: () => {},
});

function Tabs({
	defaultValue,
	value: controlledValue,
	onValueChange,
	children,
	className,
}: {
	defaultValue: string;
	value?: string;
	onValueChange?: (value: string) => void;
	children: React.ReactNode;
	className?: string;
}) {
	const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
	const isControlled = controlledValue !== undefined;
	const value = isControlled ? controlledValue : uncontrolledValue;
	const setValue = (v: string) => {
		if (!isControlled) setUncontrolledValue(v);
		onValueChange?.(v);
	};

	return (
		<TabsContext.Provider value={{ value, setValue }}>
			<div data-slot="tabs" className={className}>
				{children}
			</div>
		</TabsContext.Provider>
	);
}

function TabsList({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="tabs-list"
			className={cn(
				"bg-muted text-muted-foreground inline-flex h-9 items-center justify-center rounded-lg p-1",
				className,
			)}
			{...props}
		/>
	);
}

function TabsTrigger({
	className,
	value,
	...props
}: React.ComponentProps<"button"> & { value: string }) {
	const ctx = useContext(TabsContext);

	return (
		<button
			type="button"
			data-slot="tabs-trigger"
			data-state={ctx.value === value ? "active" : "inactive"}
			className={cn(
				"inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50",
				ctx.value === value ? "bg-background text-foreground shadow" : "hover:text-foreground/80",
				className,
			)}
			onClick={() => ctx.setValue(value)}
			{...props}
		/>
	);
}

function TabsContent({
	className,
	value,
	...props
}: React.ComponentProps<"div"> & { value: string }) {
	const ctx = useContext(TabsContext);

	if (ctx.value !== value) return null;

	return (
		<div
			data-slot="tabs-content"
			className={cn("mt-2 ring-offset-background outline-none", className)}
			{...props}
		/>
	);
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
