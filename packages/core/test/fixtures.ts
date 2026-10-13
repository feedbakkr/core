// Loads every schema the compatibility tests run against:
// - the 74 marketplace templates (feedbakkr apps/admin/marketplace-templates),
// - the 4 platform forms (feedbakkr apps/admin/config/platform-project.json),
// - the per-type schemas in fixtures/types.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// import.meta.dirname, not a URL: the React tests run under jsdom, whose URL
// resolves relative paths differently.
const ROOT = join(import.meta.dirname, "../../../fixtures/");

export interface Fixture {
	name: string;
	schema: Record<string, unknown>;
}

function readJson(path: string): unknown {
	return JSON.parse(readFileSync(path, "utf8"));
}

export function templateFixtures(): Fixture[] {
	const dir = join(ROOT, "templates");
	return readdirSync(dir)
		.filter((f) => f.endsWith(".json"))
		.sort()
		.flatMap((file) =>
			(readJson(join(dir, file)) as { templateKey: string; schema: Record<string, unknown> }[]).map(
				(t) => ({ name: `template ${t.templateKey}`, schema: t.schema }),
			),
		);
}

export function platformFixtures(): Fixture[] {
	const project = readJson(join(ROOT, "platform/platform-project.json")) as {
		channels: { slug: string; draftSchemaJson: Record<string, unknown> }[];
	};
	return project.channels.map((c) => ({ name: `platform ${c.slug}`, schema: c.draftSchemaJson }));
}

export function typeFixtures(): Fixture[] {
	const dir = join(ROOT, "types");
	return readdirSync(dir)
		.filter((f) => f.endsWith(".json"))
		.sort()
		.map((file) => ({
			name: `types ${file}`,
			schema: readJson(join(dir, file)) as Record<string, unknown>,
		}));
}

export function allFixtures(): Fixture[] {
	return [...templateFixtures(), ...platformFixtures(), ...typeFixtures()];
}
