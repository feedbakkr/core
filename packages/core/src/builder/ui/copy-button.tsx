import { Check, Copy } from "lucide-react";
import { useState } from "react";

interface CopyButtonProps {
	value: string;
	className?: string;
}

export function CopyButton({ value, className = "" }: CopyButtonProps) {
	const [copied, setCopied] = useState(false);

	function handleCopy() {
		navigator.clipboard.writeText(value).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		});
	}

	return (
		<div className={`flex items-center gap-1.5 ${className}`}>
			<span
				className={`text-xs font-medium text-primary transition-all duration-300 ${
					copied ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
				}`}
			>
				Copied!
			</span>
			<button
				type="button"
				onClick={handleCopy}
				className="flex h-7 w-7 items-center justify-center rounded-md border bg-background text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
				aria-label="Copy to clipboard"
			>
				{copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
			</button>
		</div>
	);
}
