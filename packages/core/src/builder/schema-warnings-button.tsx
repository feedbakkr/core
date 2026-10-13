import { AlertTriangle } from "lucide-react";
import { useMemo, useState } from "react";
import type { SchemaDslV1 } from "../schema/schema-dsl.js";
import { getSchemaWarnings } from "./schema-warnings.js";
import { Button } from "./ui/button.js";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "./ui/dialog.js";

export function SchemaWarningsButton({ schema }: { schema: SchemaDslV1 }) {
	const warnings = useMemo(() => getSchemaWarnings(schema), [schema]);
	const [open, setOpen] = useState(false);

	if (warnings.length === 0) return null;

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-amber-600 transition-colors hover:bg-amber-50 hover:text-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/40 dark:hover:text-amber-300"
				aria-label={`${warnings.length} schema warning${warnings.length === 1 ? "" : "s"}`}
			>
				<AlertTriangle className="h-4 w-4" />
				<span className="text-sm font-medium">{warnings.length}</span>
			</button>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<AlertTriangle className="h-4 w-4 text-amber-500" />
							Schema Recommendations
						</DialogTitle>
					</DialogHeader>
					<div className="space-y-3 py-2">
						{warnings.map((w, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: static list
							<div key={i} className="flex gap-3 rounded-md border px-3 py-2.5 text-sm">
								<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
								<div>
									{w.fieldKey && (
										<p className="mb-0.5 font-medium">
											{w.fieldLabel}{" "}
											<span className="font-mono text-xs text-muted-foreground">
												({w.fieldKey})
											</span>
										</p>
									)}
									<p className="text-muted-foreground">{w.message}</p>
								</div>
							</div>
						))}
					</div>
					<DialogFooter>
						<DialogClose asChild>
							<Button variant="outline">Close</Button>
						</DialogClose>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
