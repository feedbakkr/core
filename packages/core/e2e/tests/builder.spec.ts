// The builder in a real browser, on the test page (e2e/page). Every test also
// checks the page made no request beyond the test server itself.
import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { expect, test } from "./no-requests.js";

async function schema(page: Page) {
	return JSON.parse((await page.getByTestId("schema").textContent()) ?? "null");
}

/** The field rows: buttons that open the field, each holding a reorder grip. */
const fieldList = (page: Page) =>
	page.getByRole("button").filter({ has: page.getByRole("button", { name: /^Reorder / }) });

test.beforeEach(async ({ page }) => {
	await page.goto("/");
	await expect(page.getByRole("heading", { name: "3 fields" })).toBeVisible();
});

test("adds a field", async ({ page }) => {
	await page.getByPlaceholder("e.g. Full Name").fill("Phone number");
	await page.getByRole("combobox").first().selectOption("phone");
	await page.getByRole("checkbox").first().check();
	await page.getByRole("button", { name: "Add", exact: true }).click();

	await expect(page.getByRole("heading", { name: "4 fields" })).toBeVisible();
	expect((await schema(page)).fields.at(-1)).toEqual({
		k: "phoneNumber",
		label: "Phone number",
		t: "phone",
		req: true,
	});
});

test("edits a field", async ({ page }) => {
	await fieldList(page).filter({ hasText: "Email" }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog.getByRole("heading", { name: "Edit Field" })).toBeVisible();
	await dialog.getByRole("textbox").first().fill("Work email");
	await dialog.getByRole("button", { name: "Save" }).click();

	await expect(dialog).toBeHidden();
	expect((await schema(page)).fields[1]).toMatchObject({ k: "email", label: "Work email" });
});

test("reorders fields by dragging", async ({ page }) => {
	const grip = page.getByRole("button", { name: "Reorder Your name", exact: true });
	const target = fieldList(page).filter({ hasText: "Message" });
	const from = await grip.boundingBox();
	const to = await target.boundingBox();
	if (!from || !to) throw new Error("field rows not laid out");

	await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
	await page.mouse.down();
	await page.mouse.move(from.x + from.width / 2, to.y + to.height / 2 + 5, { steps: 12 });
	await page.mouse.up();

	await expect
		.poll(async () => (await schema(page)).fields.map((f: { k: string }) => f.k))
		.toEqual(["email", "message", "name"]);
});

test("previews the form and checks answers locally", async ({ page }) => {
	const preview = page.getByRole("region", { name: "Preview" });
	await preview.getByLabel("Your name").fill("Ada");
	await preview.getByLabel("Email").fill("ada@example.com");
	await preview.getByRole("button", { name: "Check answers" }).click();

	// Shown as the message they make, not as data.
	const message = page.getByRole("dialog");
	await expect(message).toContainText("These answers pass the form's checks.");
	await expect(message).toContainText("Ada");
	await expect(message).not.toContainText('"name"');
	await message.getByRole("button", { name: "Close" }).first().click();

	// The preview follows the schema.
	await page.getByPlaceholder("e.g. Full Name").fill("Company");
	await page.getByRole("button", { name: "Add", exact: true }).click();
	await expect(preview.getByLabel("Company")).toBeVisible();
});

test("exports the schema as text and as a JSON template", async ({ page }) => {
	await page.getByRole("button", { name: "Export" }).click();
	await page.getByRole("button", { name: /Text DSL/ }).click();
	const text = page.waitForEvent("download");
	await page.getByRole("button", { name: "Save as file" }).click();
	const textFile = await text;
	expect(textFile.suggestedFilename()).toBe("contact-us.txt");
	const dsl = await readFile(await textFile.path(), "utf8");
	expect(dsl).toContain('name: text "Your name" required min=1 max=100');

	await page.getByRole("button", { name: "Export" }).click();
	await page.getByRole("button", { name: /JSON Schema/ }).click();
	const json = page.waitForEvent("download");
	await page.getByRole("button", { name: "Save as file" }).click();
	const template = JSON.parse(await readFile(await (await json).path(), "utf8"));
	expect(template).toMatchObject({ format_version: "1.0", title: "Contact us" });
	expect(template.schema).toEqual(await schema(page));
});

test("saves after a change, checked, and reports dirty state", async ({ page }) => {
	const save = page.getByRole("button", { name: "Save Changes" });
	await expect(save).toBeDisabled();
	await page.getByPlaceholder("e.g. Full Name").fill("Company");
	await page.getByRole("button", { name: "Add", exact: true }).click();
	await expect(page.getByTestId("dirty")).toHaveText("true");
	await save.click();

	await expect(page.getByTestId("dirty")).toHaveText("false");
	await expect(page.getByTestId("notices")).toContainText("Draft saved.");
	expect(JSON.parse((await page.getByTestId("saved").textContent()) ?? "null")).toEqual(
		await schema(page),
	);
});

test("styles the builder from its own stylesheet", async ({ page }) => {
	const add = page.getByRole("button", { name: "Add", exact: true });
	await page.getByPlaceholder("e.g. Full Name").fill("Company");
	// FeedBakkr's teal, from --color-primary, with white text.
	await expect(add).toHaveCSS(
		"background-color",
		/oklch\(0\.55 0\.14 195\)|rgb\(0, 1[0-9]{2}, 1[0-9]{2}\)/,
	);
	await expect(add).toHaveCSS("border-radius", "8px");
	await page.screenshot({ path: "test-results/builder.png", fullPage: true });

	// Dialogs render outside the builder's element and are styled all the same.
	await fieldList(page).filter({ hasText: "Email" }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog).toHaveCSS("border-radius", "10px");
	await expect(dialog).toHaveCSS("position", "fixed");
	await page.screenshot({ path: "test-results/builder-dialog.png" });
});
