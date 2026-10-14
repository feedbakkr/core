import { describe, expect, it } from "vitest";
import { SITEVERIFY_URL, TURNSTILE_TEST_KEYS, verifyTurnstile } from "../src/server.js";

const SECRET = "0x4AAAAAAAreal-secret";

/** A fetch that answers like siteverify and records what it was sent. */
function siteverify(reply: unknown, status = 200) {
	const calls: { url: string; body: URLSearchParams }[] = [];
	const fetch = (async (url: string, init: RequestInit) => {
		calls.push({ url, body: init.body as URLSearchParams });
		return new Response(JSON.stringify(reply), { status });
	}) as unknown as typeof globalThis.fetch;
	return { fetch, calls };
}

const passed = {
	success: true,
	"error-codes": [],
	challenge_ts: "2026-10-14T10:00:00Z",
	hostname: "foodacn.com",
	action: "contact",
	cdata: "x",
};

describe("verifyTurnstile", () => {
	it("passes a good token, sending the secret, token, IP and idempotency key", async () => {
		const sv = siteverify(passed);
		const result = await verifyTurnstile("tok", {
			secret: SECRET,
			remoteIp: "203.0.113.9",
			idempotencyKey: "req-1",
			expectedAction: "contact",
			expectedHostname: ["www.foodacn.com", "foodacn.com"],
			fetch: sv.fetch,
		});
		expect(result).toEqual({
			ok: true,
			action: "contact",
			hostname: "foodacn.com",
			challengeTs: "2026-10-14T10:00:00Z",
			cdata: "x",
		});
		expect(sv.calls[0]?.url).toBe(SITEVERIFY_URL);
		expect(Object.fromEntries(sv.calls[0]?.body ?? [])).toEqual({
			secret: SECRET,
			response: "tok",
			remoteip: "203.0.113.9",
			idempotency_key: "req-1",
		});
	});

	it("refuses without asking Cloudflare when there is no token or no secret", async () => {
		const sv = siteverify(passed);
		for (const token of [undefined, null, 1, "", "  ", "x".repeat(2049)]) {
			expect(await verifyTurnstile(token, { secret: SECRET, fetch: sv.fetch })).toMatchObject({
				ok: false,
				reason: "missing-token",
			});
		}
		expect(await verifyTurnstile("tok", { secret: undefined, fetch: sv.fetch })).toMatchObject({
			ok: false,
			reason: "missing-secret",
		});
		expect(sv.calls).toEqual([]);
	});

	it("passes on Cloudflare's reasons when it says no", async () => {
		const sv = siteverify({ success: false, "error-codes": ["timeout-or-duplicate"] });
		expect(await verifyTurnstile("tok", { secret: SECRET, fetch: sv.fetch })).toEqual({
			ok: false,
			reason: "rejected",
			errorCodes: ["timeout-or-duplicate"],
		});
	});

	it("fails closed when Cloudflare cannot be reached, never throwing", async () => {
		const down = siteverify({}, 502);
		expect(await verifyTurnstile("tok", { secret: SECRET, fetch: down.fetch })).toEqual({
			ok: false,
			reason: "unavailable",
			errorCodes: ["http-502"],
		});
		const broken = (async () => {
			throw new TypeError("network");
		}) as unknown as typeof fetch;
		expect(await verifyTurnstile("tok", { secret: SECRET, fetch: broken })).toMatchObject({
			reason: "unavailable",
			errorCodes: ["network-error"],
		});
		const garbled = (async () =>
			new Response("<html>", { status: 200 })) as unknown as typeof fetch;
		expect(await verifyTurnstile("tok", { secret: SECRET, fetch: garbled })).toMatchObject({
			reason: "unavailable",
		});
	});

	it("gives up after the timeout", async () => {
		const slow = ((_url: string, init: RequestInit) =>
			new Promise((_resolve, reject) => {
				init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
			})) as unknown as typeof fetch;
		const started = Date.now();
		const result = await verifyTurnstile("tok", { secret: SECRET, fetch: slow, timeoutMs: 50 });
		expect(result).toEqual({ ok: false, reason: "unavailable", errorCodes: ["timeout"] });
		expect(Date.now() - started).toBeLessThan(1000);
	});

	it("refuses a token issued for another action or site", async () => {
		const sv = siteverify(passed);
		expect(
			await verifyTurnstile("tok", { secret: SECRET, expectedAction: "login", fetch: sv.fetch }),
		).toMatchObject({ reason: "action-mismatch" });
		expect(
			await verifyTurnstile("tok", {
				secret: SECRET,
				expectedHostname: "evil.example",
				fetch: sv.fetch,
			}),
		).toMatchObject({ reason: "hostname-mismatch" });
	});

	it("does not compare action or hostname under the test secrets", async () => {
		const sv = siteverify({ success: true, hostname: "example.com", action: "" });
		const result = await verifyTurnstile(TURNSTILE_TEST_KEYS.dummyToken, {
			secret: TURNSTILE_TEST_KEYS.secret.passes,
			expectedAction: "contact",
			expectedHostname: "foodacn.com",
			fetch: sv.fetch,
		});
		expect(result.ok).toBe(true);
	});
});
