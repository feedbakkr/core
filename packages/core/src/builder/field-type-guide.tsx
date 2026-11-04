// Plain-language guidance for choosing a field type: a grouped picker, a hint
// under it for the chosen type, and a guide to every type. The words are for
// people who are not developers; the stored type names do not change.
import { CircleHelp } from "lucide-react";
import { useState } from "react";
import type { FieldType } from "../schema/schema-dsl.js";
import { FIELD_TYPE_LABELS } from "./reducer.js";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "./ui/dialog.js";
import { Select } from "./ui/select.js";

/** What each type collects, and an example of when to use it (read after "For example:"). */
export const FIELD_TYPE_GUIDE: Record<FieldType, { what: string; example: string }> = {
	text: { what: "One line of text.", example: "a name, a subject or an order number." },
	textarea: { what: "Several lines of text.", example: "a message, a question or feedback." },
	markdown: {
		what: "Several lines where people can use Markdown for bold, lists and links; the inbox shows it formatted.",
		example: "bug reports with steps. Most forms want Long text instead.",
	},
	email: {
		what: "An email address, checked to be valid.",
		example: "where to send your reply.",
	},
	phone: {
		what: "A phone number: digits, spaces, dashes, brackets and +. Phones show a number keypad.",
		example: "a callback number.",
	},
	url: {
		what: "A full web address, starting with https://.",
		example: "a website or a link to a file.",
	},
	date: {
		what: "A calendar date. You can set the earliest and latest allowed.",
		example: "a date of birth or a delivery date.",
	},
	datetime: { what: "A date with a time of day.", example: "an appointment." },
	time: { what: "A time of day, without a date.", example: "the best time to call." },
	daterange: {
		what: "A start and an end date. You can limit how long the range can be.",
		example: "holiday dates or a booking.",
	},
	number: {
		what: "Any number, decimals allowed.",
		example: "a price, a weight or a rating such as 4.5.",
	},
	integer: {
		what: "A number without decimals.",
		example: "a quantity, an age or a number of guests.",
	},
	bool: {
		what: "A single tick box: ticked means yes.",
		example: "consent, or “Sign me up to the newsletter”.",
	},
	fixed: {
		what: "One option, picked from a list you write.",
		example: "a topic, a department or a size.",
	},
	dynlist: {
		what: "Entries people add one at a time, as many as they need, each of the same type.",
		example: "the names of everyone attending.",
	},
};

const GROUPS: Array<{ label: string; types: FieldType[] }> = [
	{ label: "Text", types: ["text", "textarea", "markdown"] },
	{ label: "Contact details", types: ["email", "phone", "url"] },
	{ label: "Dates and times", types: ["date", "datetime", "time", "daterange"] },
	{ label: "Numbers", types: ["number", "integer"] },
	{ label: "Choices and lists", types: ["bool", "fixed", "dynlist"] },
];

/** Exported for the test that every type is in exactly one group. */
export const FIELD_TYPE_GROUPS = GROUPS;

/** The type dropdown, grouped by kind. */
export function FieldTypeSelect({
	value,
	onChange,
	disabled,
	className,
	id,
	"aria-describedby": describedBy,
}: {
	value: FieldType;
	onChange: (type: FieldType) => void;
	disabled?: boolean;
	className?: string;
	id?: string;
	"aria-describedby"?: string;
}) {
	return (
		<Select
			id={id}
			value={value}
			disabled={disabled}
			onChange={(e) => onChange(e.target.value as FieldType)}
			className={className}
			aria-describedby={describedBy}
		>
			{GROUPS.map((g) => (
				<optgroup key={g.label} label={g.label}>
					{g.types.map((t) => (
						<option key={t} value={t}>
							{FIELD_TYPE_LABELS[t]}
						</option>
					))}
				</optgroup>
			))}
		</Select>
	);
}

/** One line under the dropdown: what the chosen type collects, with an example. */
export function FieldTypeHint({ type, id }: { type: FieldType; id?: string }) {
	const guide = FIELD_TYPE_GUIDE[type];
	return (
		<p id={id} className="text-xs text-muted-foreground">
			<span className="font-medium text-foreground">{FIELD_TYPE_LABELS[type]}:</span> {guide.what}{" "}
			For example: {guide.example}
		</p>
	);
}

/** "Which type should I use?": every type, grouped, with what it collects and an example. */
export function FieldTypeGuideButton() {
	const [open, setOpen] = useState(false);
	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
			>
				<CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
				Which type should I use?
			</button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Field types</DialogTitle>
						<DialogDescription>
							The type sets the input people see and how their answer is checked. You can change it
							later.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-5">
						{GROUPS.map((g) => (
							<section key={g.label} className="space-y-2">
								<h3 className="text-sm font-semibold">{g.label}</h3>
								<dl className="divide-y rounded-md border">
									{g.types.map((t) => (
										<div key={t} className="grid gap-1 px-3 py-2 sm:grid-cols-[9rem_1fr]">
											<dt className="text-sm font-medium">{FIELD_TYPE_LABELS[t]}</dt>
											<dd className="text-sm text-muted-foreground">
												{FIELD_TYPE_GUIDE[t].what}{" "}
												<span className="text-foreground/80">
													For example: {FIELD_TYPE_GUIDE[t].example}
												</span>
											</dd>
										</div>
									))}
								</dl>
							</section>
						))}
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
