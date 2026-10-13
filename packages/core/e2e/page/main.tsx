// The test page for the builder: the built package as an app would import it,
// with the schema shown so tests can read what the builder reports.
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { FeedbakkrBuilder } from "../../dist/builder.js";
import "../../dist/builder.css";
import type { SchemaDslV1 } from "../../dist/index.js";

const start: SchemaDslV1 = {
	v: 1,
	title: "Contact us",
	fields: [
		{ k: "name", label: "Your name", t: "text", req: true, min: 1, max: 100 },
		{ k: "email", label: "Email", t: "email", req: true },
		{ k: "message", label: "Message", t: "textarea", max: 2000 },
	],
	preview: { mode: "custom", fields: ["name"] },
};

function Page() {
	const [schema, setSchema] = useState(start);
	const [saved, setSaved] = useState<SchemaDslV1 | null>(null);
	const [dirty, setDirty] = useState(false);
	const [notices, setNotices] = useState<string[]>([]);
	return (
		<main style={{ maxWidth: 1100, margin: "2rem auto", padding: "0 1rem" }}>
			<FeedbakkrBuilder
				value={schema}
				onChange={setSchema}
				onSave={(s) => setSaved(s)}
				onDirtyChange={setDirty}
				onNotify={(n) => setNotices((all) => [...all, n.message])}
			/>
			<pre data-testid="schema" hidden>
				{JSON.stringify(schema)}
			</pre>
			<pre data-testid="saved" hidden>
				{JSON.stringify(saved)}
			</pre>
			<p data-testid="dirty" hidden>
				{String(dirty)}
			</p>
			<ul data-testid="notices" hidden>
				{notices.map((n, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: append-only list
					<li key={i}>{n}</li>
				))}
			</ul>
		</main>
	);
}

createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<Page />
	</StrictMode>,
);
