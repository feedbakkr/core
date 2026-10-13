import { test as base, expect } from "@playwright/test";

/**
 * `test` that fails if the page requests anything beyond the test server:
 * the builder and the forms must work with no network calls.
 */
export const test = base.extend<{ requests: string[] }>({
	requests: [
		async ({ page, baseURL }, use) => {
			const outside: string[] = [];
			page.on("request", (request) => {
				const url = request.url();
				if (!url.startsWith(`${baseURL}/`) && !/^(data|blob):/.test(url)) outside.push(url);
			});
			await use(outside);
			expect(outside, "requests outside the test page").toEqual([]);
		},
		{ auto: true },
	],
});

export { expect };
