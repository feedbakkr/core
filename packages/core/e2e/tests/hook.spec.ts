// useFeedbakkrForm in a real browser, on e2e/page/hook.html: a contact form
// is checked as it is filled in, submitted, and turned into a stored message
// by the same pipeline the server runs. No request leaves the test page.
import { expect, test } from "./no-requests.js";

test.beforeEach(async ({ page }) => {
	await page.goto("/hook.html");
});

test("a contact form built on the hook checks, submits and prepares a message", async ({
	page,
}) => {
	const alerts = page.getByRole("alert");

	// Nothing filled in: the required fields are refused.
	await page.getByRole("button", { name: "Send" }).click();
	await expect(alerts).toHaveText(["Required", "Required", "Required", "Required"]);

	// A field is checked when the person leaves it.
	await page.getByLabel("Email").fill("jane@");
	await page.getByLabel("Guests").focus();
	await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
	await expect(page.locator("#f-email-error")).toHaveText("Invalid email address");

	await page.getByLabel("Your name").fill("  Jane Smith ");
	await page.getByLabel("Email").fill("jane@example.com");
	await page.getByLabel("What is it about?").selectOption("order");
	await page.getByLabel("Guests").fill("12");
	await page.getByLabel("Message").fill("Where is my order, please?");
	await page.getByRole("button", { name: "Send" }).click();
	await expect(page.locator("#f-guests-error")).toHaveText("Must be at most 8");

	await page.getByLabel("Guests").fill("2");
	await page.getByRole("button", { name: "Send" }).click();
	await expect(alerts).toHaveCount(0);

	const stored = page.getByRole("region", { name: "Stored message" });
	await expect(stored.getByTestId("summary")).toHaveText("Jane Smith · An order");
	await expect(stored.locator("dd")).toHaveText([
		"Jane Smith",
		"jane@example.com",
		"An order",
		"2",
		"Where is my order, please?",
		"https://foodacn.com/contact",
	]);
	await expect(stored.getByTestId("hash")).toHaveText(/^[0-9a-f]{64}$/);
});
