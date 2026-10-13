// The done-when for schema v2: a conditional enquiry is checked step by step
// in the browser, each step a section, and as a whole by the server's check,
// with the same result. No request leaves the test page.
import { expect, test } from "./no-requests.js";

test.beforeEach(async ({ page }) => {
	await page.goto("/wizard.html");
});

test("a supplier is asked about volume, and both checks accept the answers", async ({ page }) => {
	const next = page.getByRole("button", { name: "Next" });
	await expect(page.getByRole("heading")).toHaveText("About you");
	await next.click();
	await expect(page.getByRole("alert")).toHaveText([" Required", " Required", " Required"]);

	await page.getByLabel("Your name").fill("Jane");
	await page.getByLabel("Email").fill("jane@example.com");
	await page.getByLabel("Enquiry type").selectOption("supplier");
	await expect(page.getByRole("list", { name: "Steps" }).getByRole("listitem")).toHaveText([
		"About you (done)",
		"Your business ",
		"Your request ",
	]);
	await next.click();

	await expect(page.getByRole("heading")).toHaveText("Your business");
	await expect(page.getByLabel("Covers per night")).toHaveCount(0);
	await next.click();
	await expect(page.locator("#f-volume-error")).toHaveText(" Required");
	await page.getByLabel("Expected monthly volume").fill("40");
	await page.getByLabel("What do you supply?").fill("Cheese, Butter");
	await next.click();

	await expect(page.getByRole("heading")).toHaveText("Your request");
	await page.getByLabel("Details").fill("We would like to talk.");
	await page.getByLabel("Call me back").check();
	await page.getByRole("button", { name: "Send" }).click();
	await expect(page.locator("#f-callTime-error")).toHaveText(" Required");
	await page.getByLabel("Best time to call").fill("09:30");
	await page.getByRole("button", { name: "Send" }).click();

	await expect(page.getByTestId("browser")).toHaveText("every step passes");
	const stored = JSON.parse((await page.getByTestId("server").textContent()) ?? "{}");
	expect(stored).toEqual({
		name: "Jane",
		email: "jane@example.com",
		enquiryType: "supplier",
		volume: 40,
		products: ["Cheese", "Butter"],
		details: "We would like to talk.",
		callMe: true,
		callTime: "09:30",
		source_page: "https://foodacn.com/work-with-us",
	});
});

test("changing the answer that a step depends on changes the steps", async ({ page }) => {
	await page.getByLabel("Your name").fill("Jane");
	await page.getByLabel("Email").fill("jane@example.com");
	await page.getByLabel("Enquiry type").selectOption("other");
	await expect(page.getByRole("list", { name: "Steps" }).getByRole("listitem")).toHaveCount(2);
	await page.getByRole("button", { name: "Next" }).click();
	await expect(page.getByRole("heading")).toHaveText("Your request");
	await page.getByLabel("Details").fill("Just saying hello.");
	await page.getByRole("button", { name: "Send" }).click();

	const stored = JSON.parse((await page.getByTestId("server").textContent()) ?? "{}");
	expect(stored).toMatchObject({ enquiryType: "other" });
	expect(stored).not.toHaveProperty("volume");
});
