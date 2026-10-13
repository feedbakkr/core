// The test page for useFeedbakkrForm: a contact form made of plain inputs,
// as an app builds one from its own components. On submit it runs the
// server's pipeline (prepareMessage) in the page and shows what it returns.
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { type PreparedMessage, prepareMessage, type SchemaDslV1 } from "../../dist/index.js";
import { useFeedbakkrForm } from "../../dist/react.js";

const contact: SchemaDslV1 = {
	v: 1,
	title: "Contact us",
	fields: [
		{ k: "name", label: "Your name", t: "text", req: true, max: 100 },
		{ k: "email", label: "Email", t: "email", req: true },
		{
			k: "topic",
			label: "What is it about?",
			t: "fixed",
			req: true,
			opts: [
				{ k: "order", label: "An order" },
				{ k: "other", label: "Something else" },
			],
		},
		{ k: "guests", label: "Guests", t: "integer", min: 1, max: 8 },
		{ k: "message", label: "Message", t: "textarea", req: true, min: 10, max: 2000 },
		{ k: "source_page", label: "Page", t: "url", hidden: true },
	],
	preview: { mode: "custom", fields: ["name", "topic"] },
};

function ContactPage() {
	const [message, setMessage] = useState<PreparedMessage | null>(null);
	const form = useFeedbakkrForm(contact, {
		initialValues: { source_page: "https://foodacn.com/contact" },
		onSubmit: async (values) => {
			// What the server route does with the same schema.
			const result = await prepareMessage(contact, values);
			if (result.ok) setMessage(result);
			else form.setErrors(result.errors);
		},
	});
	return (
		<main style={{ maxWidth: 480, margin: "2rem auto", fontFamily: "system-ui" }}>
			<form onSubmit={form.handleSubmit} noValidate>
				{form.fields.map((field) => {
					const id = `f-${field.k}`;
					const error = form.errorFor(field.k);
					const common = {
						id,
						value: String(form.values[field.k] ?? ""),
						onBlur: () => form.blur(field.k),
						"aria-invalid": error ? true : undefined,
						"aria-describedby": error ? `${id}-error` : undefined,
					};
					return (
						<p key={field.k}>
							<label htmlFor={id}>{field.label}</label>
							<br />
							{field.t === "fixed" ? (
								<select {...common} onChange={(e) => form.setValue(field.k, e.target.value)}>
									<option value="">Choose one</option>
									{field.opts.map((o) => (
										<option key={o.k} value={o.k}>
											{o.label ?? o.k}
										</option>
									))}
								</select>
							) : field.t === "textarea" ? (
								<textarea {...common} onChange={(e) => form.setValue(field.k, e.target.value)} />
							) : (
								<input {...common} onChange={(e) => form.setValue(field.k, e.target.value)} />
							)}
							{error && (
								<span id={`${id}-error`} role="alert">
									{error}
								</span>
							)}
						</p>
					);
				})}
				<button type="submit" disabled={form.submitting}>
					Send
				</button>
			</form>
			{message && (
				<section aria-label="Stored message">
					<p data-testid="summary">{message.summary}</p>
					<dl>
						{message.rows.map((row) => (
							<div key={row.key}>
								<dt>{row.label}</dt>
								<dd>{row.display}</dd>
							</div>
						))}
					</dl>
					<p data-testid="hash">{message.schemaHash}</p>
				</section>
			)}
		</main>
	);
}

createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<ContactPage />
	</StrictMode>,
);
