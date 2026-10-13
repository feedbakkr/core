// The builder's preview, from FeedBakkr's TestFormPanel
// (apps/app/app/components/test-form-panel.tsx at 8ae744e). It keeps the
// autofill button and DynamicForm. FeedBakkr sent the answers to the channel's
// dev inbox, with an optional sent date; here they are only checked, and the
// answers that pass are shown.
import { Check, Wand2 } from "lucide-react";
import { useState } from "react";
import { DynamicForm } from "../react/dynamic-form.js";
import { generateSampleData } from "../schema/generate-sample-data.js";
import type { SchemaDslV1 } from "../schema/schema-dsl.js";
import { CodePreview } from "./code-preview.js";
import { Button } from "./ui/button.js";

export function TestFormPanel({ schema }: { schema: SchemaDslV1 }) {
	const [formKey, setFormKey] = useState(0);
	const [autofillValues, setAutofillValues] = useState<Record<string, unknown> | undefined>();
	const [result, setResult] = useState<{ schema: string; answers: Record<string, unknown> }>();

	// The form starts again whenever the schema changes.
	const schemaJson = JSON.stringify(schema);
	const checked = result?.schema === schemaJson ? result.answers : undefined;

	const handleAutofill = () => {
		setAutofillValues(generateSampleData(schema));
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
			<DynamicForm
				key={`${formKey}:${schemaJson}`}
				schema={schema}
				initialValues={autofillValues}
				onSubmit={(answers) => setResult({ schema: schemaJson, answers })}
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
				<div className="mt-4 space-y-2" role="status">
					<p className="text-xs font-medium text-green-700 dark:text-green-400">
						These answers pass the form's checks.
					</p>
					<CodePreview code={JSON.stringify(checked, null, 2)} />
				</div>
			)}
		</div>
	);
}
