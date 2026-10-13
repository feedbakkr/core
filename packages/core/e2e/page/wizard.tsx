// A multi-step form on useFeedbakkrForm, one section per step, from the v2
// fixture (fixtures/v2/conditional-enquiry.json).
// Each step is checked on its own in the browser; the last step runs the
// server's check on the whole form, and the page shows both verdicts.
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import enquiry from "../../../../fixtures/v2/conditional-enquiry.json";
import { type SchemaDslV2, validateSubmission } from "../../dist/index.js";
import { useFeedbakkrForm } from "../../dist/react.js";

const schema = enquiry as SchemaDslV2;

function Wizard() {
	const [step, setStep] = useState(0);
	const [server, setServer] = useState<string | null>(null);
	const form = useFeedbakkrForm(schema, {
		initialValues: { source_page: "https://foodacn.com/work-with-us" },
		onSubmit: (values) => {
			// What the route does with the same schema and answers.
			const result = validateSubmission(schema, values);
			setServer(result.ok ? JSON.stringify(result.values) : "refused");
		},
	});
	const steps = form.sections.filter((s) => s.applies);
	const current = steps[Math.min(step, steps.length - 1)];
	if (!current) return null;
	const last = current === steps.at(-1);

	return (
		<main style={{ maxWidth: 480, margin: "2rem auto", fontFamily: "system-ui" }}>
			<ol aria-label="Steps">
				{steps.map((s) => (
					<li key={s.id} aria-current={s === current ? "step" : undefined}>
						{s.title} {s.valid ? "(done)" : ""}
					</li>
				))}
			</ol>
			<h1>{current.title}</h1>
			{current.desc && <p>{current.desc}</p>}
			{current.fields.map((field) => {
				const id = `f-${field.k}`;
				const error = form.errorFor(field.k);
				const value = form.values[field.k];
				return (
					<p key={field.k}>
						<label htmlFor={id}>{field.label}</label>
						<br />
						{field.t === "fixed" ? (
							<select
								id={id}
								value={String(value ?? "")}
								onChange={(e) => form.setValue(field.k, e.target.value)}
							>
								<option value="">Choose one</option>
								{field.opts.map((o) => (
									<option key={o.k} value={o.k}>
										{o.label ?? o.k}
									</option>
								))}
							</select>
						) : field.t === "bool" ? (
							<input
								id={id}
								type="checkbox"
								checked={value === true}
								onChange={(e) => form.setValue(field.k, e.target.checked)}
							/>
						) : field.t === "dynlist" ? (
							<input
								id={id}
								value={Array.isArray(value) ? value.join(", ") : ""}
								onChange={(e) => form.setValue(field.k, e.target.value.split(","))}
							/>
						) : (
							<input
								id={id}
								value={String(value ?? "")}
								placeholder={field.placeholder}
								onChange={(e) => form.setValue(field.k, e.target.value)}
							/>
						)}
						{field.help && <small> {field.help}</small>}
						{error && (
							<span role="alert" id={`${id}-error`}>
								{" "}
								{error}
							</span>
						)}
					</p>
				);
			})}
			{step > 0 && (
				<button type="button" onClick={() => setStep(step - 1)}>
					Back
				</button>
			)}
			{last ? (
				<button
					type="button"
					onClick={() => {
						if (form.validateSection(current.id)) void form.handleSubmit();
					}}
				>
					Send
				</button>
			) : (
				<button
					type="button"
					onClick={() => {
						if (form.validateSection(current.id)) setStep(step + 1);
					}}
				>
					Next
				</button>
			)}
			<p data-testid="browser">{steps.every((s) => s.valid) ? "every step passes" : ""}</p>
			{server && <p data-testid="server">{server}</p>}
		</main>
	);
}

createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<Wizard />
	</StrictMode>,
);
