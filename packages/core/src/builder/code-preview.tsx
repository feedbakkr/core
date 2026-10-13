import { CopyButton } from "./ui/copy-button.js";

interface CodePreviewProps {
	code: string;
	language?: string;
}

export function CodePreview({ code }: CodePreviewProps) {
	return (
		<div className="relative">
			<div className="absolute right-2 top-2">
				<CopyButton value={code} />
			</div>
			<pre className="rounded-md border bg-muted p-4 pr-24 text-xs overflow-auto max-h-[600px]">
				<code>{code}</code>
			</pre>
		</div>
	);
}
