import type { DslField, SchemaDslV1 } from "./schema-dsl.js";

function pick<T>(arr: T[]): T {
	return arr[Math.floor(Math.random() * arr.length)]!;
}

function randInt(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateSampleValue(field: DslField): unknown {
	const n = randInt(1, 99);
	switch (field.t) {
		case "text": {
			const samples = [
				`Sample text #${n}`,
				`Hello world ${n}`,
				`Test input ${n}`,
				`Quick note #${n}`,
				`Entry ${n}`,
				`User feedback ${n}`,
				`Item ${n}`,
			];
			let val = pick(samples);
			if (field.min && val.length < field.min) val = val.padEnd(field.min, ".");
			if (field.max && val.length > field.max) val = val.slice(0, field.max);
			return val;
		}
		case "textarea": {
			const samples = [
				`This is test feedback #${n}. The experience was ${pick(["great", "okay", "frustrating", "smooth", "confusing"])}.`,
				`Entry ${n}: ${pick(["Everything worked as expected.", "I ran into a small issue with the layout.", "Navigation felt intuitive and fast.", "The loading times could be improved.", "Really enjoyed the new design changes."])}`,
				`Note ${n} — ${pick(["No issues found during testing.", "A few rough edges but overall solid.", "Would recommend to a colleague.", "Some fields were unclear at first.", "Works well on mobile and desktop."])}`,
			];
			let val = pick(samples);
			if (field.min && val.length < field.min) val = val.padEnd(field.min, ".");
			if (field.max && val.length > field.max) val = val.slice(0, field.max);
			return val;
		}
		case "email": {
			const samples = ["alex@example.com", "sam@example.org", "casey@example.net"];
			return pick(samples);
		}
		case "url": {
			const samples = [
				"https://example.com",
				"https://docs.example.com/guide",
				"https://example.org/feedback",
			];
			return pick(samples);
		}
		case "phone": {
			const samples = ["+1 555 123 4567", "+44 20 7946 0958", "555-0102"];
			return pick(samples);
		}
		case "date": {
			const offset = randInt(-30, 30);
			const d = new Date();
			d.setDate(d.getDate() + offset);
			return d.toISOString().split("T")[0];
		}
		case "datetime": {
			const offset = randInt(-30, 30);
			const d = new Date();
			d.setDate(d.getDate() + offset);
			const date = d.toISOString().split("T")[0];
			const hh = String(randInt(9, 17)).padStart(2, "0");
			const mm = pick(["00", "15", "30", "45"]);
			return `${date}T${hh}:${mm}`;
		}
		case "time": {
			const hh = String(randInt(8, 20)).padStart(2, "0");
			const mm = pick(["00", "15", "30", "45"]);
			return `${hh}:${mm}`;
		}
		case "daterange": {
			const d = new Date();
			const from = new Date(d);
			from.setDate(d.getDate() + randInt(0, 7));
			const to = new Date(from);
			to.setDate(from.getDate() + randInt(1, 14));
			return {
				from: from.toISOString().split("T")[0],
				to: to.toISOString().split("T")[0],
			};
		}
		case "bool":
			return Math.random() > 0.5;
		case "number":
		case "integer": {
			const min = field.min ?? 1;
			const max = field.max ?? 10;
			return randInt(min, max);
		}
		case "fixed":
			return pick(field.opts)?.k;
		case "markdown": {
			const samples = [
				`## Feedback #${n}\n\nThe experience was **${pick(["great", "smooth", "frustrating", "confusing"])}**.\n\n- ${pick(["Navigation was intuitive", "Layout felt clean", "Loading was fast"])}\n- ${pick(["No issues found", "Minor styling glitches", "Works well on mobile"])}`,
				`**Report ${n}**\n\n${pick(["Everything worked as expected.", "Ran into a small issue with the layout.", "The new design changes look *really* good."])}\n\n> ${pick(["Would recommend to a colleague.", "A few rough edges but overall solid.", "Some fields were unclear at first."])}`,
				`### Note ${n}\n\n${pick(["No issues during testing.", "A few rough edges but **overall solid**.", "Works well on both _mobile_ and desktop."])}\n\n1. Checked all fields\n2. Verified form submission\n3. Reviewed output`,
			];
			const val = pick(samples);
			if (field.max && val.length > field.max) return val.slice(0, field.max);
			return val;
		}
		case "dynlist": {
			const maxCount = Math.min(3, field.maxItems ?? 3);
			const count = randInt(1, maxCount);
			return Array.from({ length: count }, () => generateSampleValue(field.item as DslField));
		}
	}
}

export function generateSampleData(schema: SchemaDslV1): Record<string, unknown> {
	const data: Record<string, unknown> = {};
	for (const field of schema.fields) {
		data[field.k] = generateSampleValue(field);
	}
	return data;
}
