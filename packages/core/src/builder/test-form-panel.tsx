// The builder's preview, from FeedBakkr's TestFormPanel
// (apps/app/app/components/test-form-panel.tsx at 8ae744e). It keeps the
// autofill button. FeedBakkr rendered DynamicForm and sent the answers to the
// channel's dev inbox, with an optional sent date; here FeedbakkrForm renders
// v1 and v2 schemas, so fields appear and disappear as conditions change, and
// the answers are only checked. Answers that pass open as the message they
// would make: the summary, where a reply goes, and each answer under its
// label, as an inbox shows it, rather than as data.
import { Check, Wand2 } from "lucide-react";
import { useState } from "react";
import { interpretSubmission, type SubmissionRow } from "../messages/interpret.js";
import { replyToOf } from "../messages/reply-to.js";
import { summarizeSubmission } from "../messages/summarize.js";
import { FeedbakkrForm, type FormComponents } from "../react/feedbakkr-form.js";
import { generateSampleData } from "../schema/generate-sample-data.js";
import type { SchemaDslV1 } from "../schema/schema-dsl.js";
import type { SchemaDsl } from "../schema/schema-dsl-v2.js";
import { Button } from "./ui/button.js";
import { Checkbox } from "./ui/checkbox.js";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog.js";
import { Input } from "./ui/input.js";
import { Label } from "./ui/label.js";
import { Select } from "./ui/select.js";
import { Textarea } from "./ui/textarea.js";

/** The preview drawn with the builder's own pieces, so it matches the builder. */
const PREVIEW_COMPONENTS: Partial<FormComponents> = {
	Input: (props) => <Input {...props} />,
	Textarea: (props) => <Textarea {...props} />,
	Select: (props) => <Select {...props} />,
	Checkbox: (props) => <Checkbox {...props} className="inline-block align-middle mr-2" />,
	Label: ({ required, children, ...props }) => (
		<Label className="mb-1 text-sm" {...props}>
			{children}
			{required && (
				<span aria-hidden="true" className="text-destructive">
					{" *"}
				</span>
			)}
		</Label>
	),
	FieldWrapper: ({ children }) => <div className="mb-4 space-y-1">{children}</div>,
	Help: ({ id, children }) => (
		<p id={id} className="text-xs text-muted-foreground">
			{children}
		</p>
	),
	Error: ({ id, children }) => (
		<p id={id} role="alert" className="text-xs text-destructive">
			{children}
		</p>
	),
	Button: (props) => <Button type="button" variant="outline" size="sm" {...props} />,
	Section: ({ section, children }) => (
		<fieldset className="mb-4 rounded-md border p-3">
			<legend className="px-1 text-sm font-semibold">{section.title}</legend>
			{section.desc && <p className="mb-2 text-xs text-muted-foreground">{section.desc}</p>}
			{children}
		</fieldset>
	),
};

export function TestFormPanel({ schema }: { schema: SchemaDsl }) {
	const [formKey, setFormKey] = useState(0);
	const [autofillValues, setAutofillValues] = useState<Record<string, unknown> | undefined>();
	const [result, setResult] = useState<{ schema: string; answers: Record<string, unknown> }>();

	// The form starts again whenever the schema changes.
	const schemaJson = JSON.stringify(schema);
	const checked = result?.schema === schemaJson ? result.answers : undefined;
	const [open, setOpen] = useState(false);

	const handleAutofill = () => {
		setAutofillValues(generateSampleData(schema as SchemaDslV1));
		setFormKey((k) => k + 1);
		setResult(undefined);
	};

	return (
		<div>
			<div className="flex justify-end mb-2">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-7 gap-1.5 text-xs"
					onClick={handleAutofill}
				>
					<Wand2 className="h-3.5 w-3.5" />
					Autofill sample data
				</Button>
			</div>
			<FeedbakkrForm
				components={PREVIEW_COMPONENTS}
				key={`${formKey}:${schemaJson}`}
				schema={schema}
				initialValues={autofillValues}
				onSubmit={(answers) => {
					setResult({ schema: schemaJson, answers });
					setOpen(true);
				}}
				renderFooter={() => (
					<div className="flex justify-end pt-3">
						<Button type="submit" size="sm">
							<Check className="h-3.5 w-3.5" />
							Check answers
						</Button>
					</div>
				)}
			/>
			{checked && (
				<Dialog open={open} onOpenChange={setOpen}>
					<DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
						<DialogHeader>
							<DialogTitle>The message these answers make</DialogTitle>
						</DialogHeader>
						<MessagePreview schema={schema} answers={checked} />
						<DialogFooter>
							<Button type="button" variant="outline" onClick={() => setOpen(false)}>
								Close
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			)}
		</div>
	);
}

/** The checked answers as an inbox shows a message: summary, reply address, answers. */
function MessagePreview({
	schema,
	answers,
}: {
	schema: SchemaDsl;
	answers: Record<string, unknown>;
}) {
	const rows: SubmissionRow[] = interpretSubmission(schema, answers).filter((r) => !r.hidden);
	const summary = summarizeSubmission(schema, answers);
	const replyTo = replyToOf(schema, answers);
	return (
		<div className="space-y-3" role="status">
			<p className="text-xs font-medium text-green-700 dark:text-green-400">
				These answers pass the form's checks.
			</p>
			{summary && <p className="text-sm font-semibold">{summary}</p>}
			{replyTo && (
				<p className="rounded-md border px-3 py-2 text-sm">
					<span className="text-muted-foreground">Reply to </span>
					<span className="font-medium break-all">{replyTo}</span>
				</p>
			)}
			<dl className="divide-y rounded-md border">
				{rows.map((r) => (
					<div key={r.key} className="grid gap-1 px-3 py-2 sm:grid-cols-[9rem_1fr]">
						<dt className="text-sm font-medium text-muted-foreground">{r.label}</dt>
						<dd
							className={`text-sm whitespace-pre-wrap break-words ${r.value === null ? "text-muted-foreground" : ""}`}
						>
							{r.display}
						</dd>
					</div>
				))}
			</dl>
		</div>
	);
}
