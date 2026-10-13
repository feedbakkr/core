// Conditions in the text format (schema v2), after `when`:
//
//   enquiryType = supplier
//   covers != 0
//   size in [s, m, "extra large"]
//   phone filled            notes empty
//   a = 1 and (b = x or c filled)
//
// `and` binds tighter than `or`; parentheses group. A quoted value is text;
// unquoted, true and false are yes or no, a number is a number, and any other
// word is text. Converting a condition to text and back gives the same
// condition.
import type { Condition, ConditionValue } from "../schema/schema-dsl-v2.js";

const KEY = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const NUMBER = /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
const WORDS = new Set(["and", "or", "in", "filled", "empty", "true", "false"]);

type Token = { kind: "word" | "string" | "symbol"; text: string };

function lex(input: string): Token[] {
	const tokens: Token[] = [];
	let i = 0;
	while (i < input.length) {
		const ch = input[i] as string;
		if (/\s/.test(ch)) {
			i++;
		} else if (ch === '"') {
			let j = i + 1;
			let text = "";
			while (j < input.length && input[j] !== '"') {
				if (input[j] === "\\" && j + 1 < input.length) j++;
				text += input[j];
				j++;
			}
			if (j >= input.length) throw new Error("A quoted value is not closed");
			tokens.push({ kind: "string", text });
			i = j + 1;
		} else if (input.startsWith("!=", i)) {
			tokens.push({ kind: "symbol", text: "!=" });
			i += 2;
		} else if ("=()[],".includes(ch)) {
			tokens.push({ kind: "symbol", text: ch });
			i++;
		} else {
			let j = i;
			while (j < input.length && !/[\s=!()[\],"]/.test(input[j] as string)) j++;
			if (j === i) throw new Error(`Unexpected "${ch}"`);
			tokens.push({ kind: "word", text: input.slice(i, j) });
			i = j;
		}
	}
	return tokens;
}

/** Reads a condition from the text after `when`. Throws with a reason. */
export function parseCondition(input: string): Condition {
	const tokens = lex(input);
	let pos = 0;
	const peek = () => tokens[pos];
	const next = () => {
		const token = tokens[pos++];
		if (!token) throw new Error("The condition ends too soon");
		return token;
	};
	const expect = (text: string) => {
		const token = next();
		if (token.text !== text || token.kind === "string") {
			throw new Error(`Expected "${text}" but found "${token.text}"`);
		}
	};
	const isWord = (text: string) => peek()?.kind === "word" && peek()?.text === text;

	const value = (): ConditionValue => {
		const token = next();
		if (token.kind === "string") return token.text;
		if (token.kind === "symbol") throw new Error(`Expected a value but found "${token.text}"`);
		if (token.text === "true") return true;
		if (token.text === "false") return false;
		if (NUMBER.test(token.text)) return Number(token.text);
		return token.text;
	};

	const atom = (): Condition => {
		if (peek()?.kind === "symbol" && peek()?.text === "(") {
			next();
			const inner = or();
			expect(")");
			return inner;
		}
		const key = next();
		if (key.kind !== "word" || !KEY.test(key.text) || WORDS.has(key.text)) {
			throw new Error(`Expected a field key but found "${key.text}"`);
		}
		const op = next();
		if (op.kind === "symbol" && op.text === "=") return { k: key.text, eq: value() };
		if (op.kind === "symbol" && op.text === "!=") return { k: key.text, neq: value() };
		if (op.kind === "word" && op.text === "filled") return { k: key.text, filled: true };
		if (op.kind === "word" && op.text === "empty") return { k: key.text, empty: true };
		if (op.kind === "word" && op.text === "in") {
			expect("[");
			const values = [value()];
			while (peek()?.kind === "symbol" && peek()?.text === ",") {
				next();
				values.push(value());
			}
			expect("]");
			return { k: key.text, in: values };
		}
		throw new Error(`Expected =, !=, in, filled or empty after "${key.text}"`);
	};

	const and = (): Condition => {
		const parts = [atom()];
		while (isWord("and")) {
			next();
			parts.push(atom());
		}
		return parts.length === 1 ? (parts[0] as Condition) : { all: parts };
	};

	function or(): Condition {
		const parts = [and()];
		while (isWord("or")) {
			next();
			parts.push(and());
		}
		return parts.length === 1 ? (parts[0] as Condition) : { any: parts };
	}

	if (tokens.length === 0) throw new Error("The condition is empty");
	const condition = or();
	if (pos < tokens.length) throw new Error(`Unexpected "${tokens[pos]?.text}"`);
	return condition;
}

function valueToText(value: ConditionValue): string {
	if (typeof value !== "string") return String(value);
	const bare = /^[^\s=!()[\],"]+$/.test(value) && !WORDS.has(value) && !NUMBER.test(value);
	return bare ? value : `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Writes a condition as text, the inverse of `parseCondition`. */
export function conditionToText(condition: Condition): string {
	const part = (c: Condition) =>
		"all" in c || "any" in c ? `(${conditionToText(c)})` : conditionToText(c);
	if ("all" in condition) return condition.all.map(part).join(" and ");
	if ("any" in condition) return condition.any.map(part).join(" or ");
	if ("eq" in condition) return `${condition.k} = ${valueToText(condition.eq)}`;
	if ("neq" in condition) return `${condition.k} != ${valueToText(condition.neq)}`;
	if ("in" in condition) return `${condition.k} in [${condition.in.map(valueToText).join(", ")}]`;
	if ("filled" in condition) return `${condition.k} filled`;
	return `${condition.k} empty`;
}
