// Milestone 9's done-when: the builder edits a v2 schema, and the preview
// shows and hides fields as conditions change. On e2e/page with ?v2.
import type { Page } from "@playwright/test";
import { expect, test } from "./no-requests.js";

async function schema(page: Page) {
	return JSON.parse((await page.getByTestId("schema").textContent()) ?? "null");
}

const fieldRow = (page: Page, label: string) =>
	page
		.getByRole("button")
		.filter({ has: page.getByRole("button", { name: `Reorder ${label}`, exact: true }) });

test.beforeEach(async ({ page }) => {
	await page.goto("/?v2");
	await expect(page.getByText("3 fields")).toBeVisible();
});

test("adds a condition, and the preview follows it", async ({ page }) => {
	const preview = page.getByRole("region", { name: "Preview" });
	await expect(preview.getByLabel(/Monthly volume/)).toBeVisible();

	await fieldRow(page, "Monthly volume").click();
	const dialog = page.getByRole("dialog");
	await dialog.getByLabel("Show this field", { exact: true }).selectOption("when");
	await expect(dialog.getByLabel("Field", { exact: true })).toHaveValue("kind");
	await dialog.getByLabel("Comparison", { exact: true }).selectOption("eq");
	await dialog.getByLabel("Value", { exact: true }).selectOption("supplier");
	await dialog.getByLabel("Help text", { exact: true }).fill("Cases a month");
	await dialog.getByRole("button", { name: "Save" }).click();

	await expect(fieldRow(page, "Monthly volume")).toContainText("when kind = supplier");
	expect(await schema(page)).toMatchObject({
		v: 2,
		fields: [
			{ k: "kind" },
			{ k: "volume", when: { k: "kind", eq: "supplier" }, help: "Cases a month" },
			{ k: "email" },
		],
	});

	// The preview hides the field until its condition holds.
	await expect(preview.getByLabel(/Monthly volume/)).toHaveCount(0);
	await preview.getByLabel(/Enquiry type/).selectOption("supplier");
	await expect(preview.getByLabel(/Monthly volume/)).toBeVisible();
	await expect(preview.getByText("Cases a month")).toBeVisible();
	await preview.getByLabel(/Enquiry type/).selectOption("other");
	await expect(preview.getByLabel(/Monthly volume/)).toHaveCount(0);

	// It is checked only when it applies.
	await preview.getByLabel(/Email/).fill("jane@example.com");
	await preview.getByRole("button", { name: "Check answers" }).click();
	await expect(preview.getByRole("status")).toContainText('"kind": "other"');
});

test("groups fields into sections, and the preview shows them", async ({ page }) => {
	await page.getByRole("button", { name: "Group into sections", exact: true }).click();
	await page
		.getByRole("button", { name: "Start a new section at Monthly volume", exact: true })
		.click();
	await page.getByRole("button", { name: "Edit section Section 2", exact: true }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByLabel("Title", { exact: true }).fill("Your business");
	await dialog.getByLabel("Show this section", { exact: true }).selectOption("when");
	await dialog.getByLabel("Value", { exact: true }).selectOption("supplier");
	await dialog.getByRole("button", { name: "Save" }).click();

	expect((await schema(page)).sections).toEqual([
		{ id: "section_1", title: "Section 1", fields: ["kind"] },
		{
			id: "section_2",
			title: "Your business",
			fields: ["volume", "email"],
			when: { k: "kind", eq: "supplier" },
		},
	]);
	const preview = page.getByRole("region", { name: "Preview" });
	await expect(preview.getByRole("group", { name: "Section 1" })).toBeVisible();
	await expect(preview.getByRole("group", { name: "Your business" })).toHaveCount(0);
	await preview.getByLabel(/Enquiry type/).selectOption("supplier");
	await expect(preview.getByRole("group", { name: "Your business" })).toBeVisible();
});

test("keeps a locked field from being deleted", async ({ page }) => {
	await expect(page.getByRole("button", { name: "Delete Email", exact: true })).toHaveCount(0);
	await expect(
		page.getByRole("button", { name: "Delete Monthly volume", exact: true }),
	).toBeVisible();
});

test("saves a v2 schema only when it passes the v2 checks", async ({ page }) => {
	// Moving the conditional field above the one it depends on breaks it.
	await fieldRow(page, "Monthly volume").click();
	const dialog = page.getByRole("dialog");
	await dialog.getByLabel("Show this field", { exact: true }).selectOption("when");
	await dialog.getByRole("button", { name: "Save" }).click();
	const grip = page.getByRole("button", { name: "Reorder Monthly volume", exact: true });
	const target = fieldRow(page, "Enquiry type");
	const from = await grip.boundingBox();
	const to = await target.boundingBox();
	if (!from || !to) throw new Error("rows not laid out");
	await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
	await page.mouse.down();
	await page.mouse.move(from.x + from.width / 2, to.y + 5, { steps: 12 });
	await page.mouse.up();
	await expect.poll(async () => (await schema(page)).fields[0].k).toBe("volume");

	await page.getByRole("button", { name: "Save Changes" }).click();
	await expect(page.getByText(/does not come before it/).first()).toBeVisible();
	expect(JSON.parse((await page.getByTestId("saved").textContent()) ?? "null")).toBeNull();
});
