# FeedBakkr form schemas: a guide for writing them

A form is described by a **schema**: a JSON object listing its fields. The
same schema checks the form in the browser and the answers on the server.
This guide covers schema format v1, the only version so far.

Always check a schema you write. With the MCP server, call `validate_schema`
with `"publish": true`. Without it, run
`pnpm exec feedbakkr validate --publish form.json`.

## A complete example

```json
{
  "v": 1,
  "title": "Contact us",
  "desc": "We reply within two working days.",
  "fields": [
    { "k": "name", "label": "Your name", "t": "text", "req": true, "min": 1, "max": 100 },
    { "k": "email", "label": "Email", "t": "email", "req": true },
    {
      "k": "topic",
      "label": "What is it about?",
      "t": "fixed",
      "req": true,
      "opts": [
        { "k": "order", "label": "An order" },
        { "k": "partnership", "label": "Working together" },
        { "k": "other", "label": "Something else" }
      ],
      "default": "other"
    },
    { "k": "message", "label": "Message", "t": "textarea", "req": true, "min": 10, "max": 2000 },
    { "k": "source_page", "label": "Page", "t": "url", "hidden": true }
  ],
  "preview": { "mode": "custom", "fields": ["name", "topic"], "separator": " · " }
}
```

Field properties use short names: `k` is the key, `t` the type and `req`
required. Never write `key`, `type` or `required`.

## The schema object

| Property | Type | Rules |
| --- | --- | --- |
| `v` | `1` | Required. Always `1`. |
| `title` | string | Optional, 1 to 200 characters. |
| `desc` | string | Optional, up to 2,000 characters. |
| `meta` | string | Optional, up to 4,000 characters. Free text for the host app, not shown. |
| `fields` | array | Required, 0 to 25 fields. Publishing needs at least one. |
| `preview` | object | Optional. How a submission is summarised in an inbox list. See [Preview](#preview). |

## Properties every field has

| Property | Type | Rules |
| --- | --- | --- |
| `k` | string | Required. Letters, digits and `_`, not starting with a digit (`^[a-zA-Z_][a-zA-Z0-9_]*$`). Unique within the form. It is the key in the submitted answers. |
| `label` | string | Required, 1 to 200 characters. What the person filling in the form sees. |
| `t` | string | Required. One of the types below. |
| `req` | boolean | Optional. `true` means an answer must be given. |
| `hidden` | boolean | Optional. Not shown to the person; filled in by the page (for example the page URL). A hidden field is never required, even with `req: true`. |
| `default` | any | Optional. Must suit the type: see [Defaults](#defaults). |
| `meta` | string | Optional, up to 4,000 characters. Free text for the host app, such as help text. |
| `sensitive` | boolean | Optional. Marks the answer as sensitive so the host can store it encrypted. |

## Field types

| `t` | Answer | Extra properties | Notes |
| --- | --- | --- | --- |
| `text` | string | `min`, `max` (characters) | One line. Up to 500 characters unless `max` says otherwise. |
| `textarea` | string | `min`, `max` (characters) | Several lines. Up to 500 characters unless `max` says otherwise, so set `max` for long answers. |
| `markdown` | string | `max` (characters) | Formatted text. Up to 10,000 characters by default. |
| `email` | string | `max` | Must be an email address. Up to 320 characters by default. |
| `url` | string | `max` | Must be a full URL. Up to 320 characters by default. |
| `phone` | string | `max` | Digits, spaces, `+ - ( ) .`, starting with `+` or a digit. |
| `date` | `"YYYY-MM-DD"` | `min`, `max` (date bounds) | |
| `datetime` | `"YYYY-MM-DDTHH:MM"` | `min`, `max` (date bounds) | No time zone. |
| `time` | `"HH:MM"` (24 hour) | `min`, `max` (`"HH:MM"` only) | |
| `daterange` | `{ "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" }` | `min`, `max` (date bounds), `minSpanDays`, `maxSpanDays` | `from` must not be after `to`. Cannot be a list item. |
| `bool` | `true` or `false` | | A checkbox or yes/no. |
| `number` | number | `min`, `max` | Any number, decimals allowed. |
| `integer` | whole number | `min`, `max` | Use this for ratings and counts. |
| `fixed` | one option's `k` | `opts` (required) | A choice from a list. See below. |
| `dynlist` | array of answers | `item` (required), `maxItems` (1 to 100) | A repeating answer. See below. |

There is no rating, select, checkbox or file type. Use `integer` with
`min`/`max` for a rating, `fixed` for a choice and `bool` for a checkbox.
Files are not supported.

### Choices: `fixed`

```json
{
  "k": "size", "label": "Table size", "t": "fixed", "req": true,
  "opts": [{ "k": "two", "label": "2 people" }, { "k": "four", "label": "4 people" }]
}
```

`opts` holds 1 to 50 options. Each has a `k` (non-empty, any characters) and
an optional `label`. The answer is the option's `k`. Only one option can be
chosen; for several, use a `dynlist` whose item is `fixed`.

### Repeating answers: `dynlist`

```json
{
  "k": "dishes", "label": "Dishes you tried", "t": "dynlist", "maxItems": 5,
  "item": { "k": "dish", "label": "Dish", "t": "text", "req": true, "max": 100 }
}
```

`item` is a field of any type except `daterange` and `dynlist`, with its own
`k` and `label`. The answer is an array of the item's answers:
`["Ramen", "Gyoza"]`.

### Date bounds

`min` and `max` on `date`, `datetime` and `daterange` take an absolute value
or one relative to today, worked out when the answer is checked:

| Bound | Meaning |
| --- | --- |
| `2026-01-15` | That date. |
| `2026-01-15T09:30` | That date and time (datetime only). |
| `today`, `now` | Today; now. |
| `+5d`, `-5d` | Five days after or before today. Also `w` (weeks), `m` (months) and `y` (years). |
| `today-18y` | Same as `-18y`. |
| `now+30m` | Thirty minutes from now. After `now`, `m` means minutes, not months. |

For example a date of birth for adults is `"max": "-18y"`, and a booking in
the next three months is `"min": "today", "max": "+3m"`. `time` fields take
only `"HH:MM"`.

## Required answers

`req: true` means the key must be present in the answers. A required `text`
or `textarea` still accepts an empty string, so give it `"min": 1` (or more)
when a real answer is needed. A field without `req` may be left out
entirely. Answers for keys the schema does not list are dropped.

## Defaults

A `default` is the starting answer. It is checked when the schema is saved:

| Type | A default must be |
| --- | --- |
| `text`, `textarea`, `markdown` | a string within `min`/`max` |
| `number` | a number within `min`/`max` |
| `bool` | `true` or `false` |
| `date` | `"YYYY-MM-DD"` |
| `fixed` | one of the option keys |
| `dynlist` | an array of at most `maxItems` entries |

Other types are not checked, so keep their defaults in the answer format
shown in the types table.

## Preview

`preview` decides the one-line summary of a submission in an inbox list.

| Mode | Example | Meaning |
| --- | --- | --- |
| none | `{ "mode": "none" }` | No summary. |
| auto | `{ "mode": "auto", "maxLength": 80 }` | Chosen from the first suitable fields. |
| custom | see below | The fields you name. |

```json
{
  "mode": "custom",
  "fields": ["name", "topic"],
  "separator": " · ",
  "fallbackFields": ["email"],
  "prefix": "From: ",
  "maxLength": 80
}
```

- `fields`: 1 to 5 field keys, each used once.
- `separator`: one of `" "`, `" · "`, `" - "` or `", "`.
- `fallbackFields`: up to 5 keys used when the main ones are empty.
- `prefix`: up to 30 characters, shown only when the summary is not empty.
- `maxLength`: 1 to 100.

Only `text`, `textarea`, `markdown`, `email`, `url`, `phone`, `fixed` and
`dynlist` fields can be named. Numbers, dates, times and booleans cannot.

## The checks

`validate_schema` (and `feedbakkr validate`) runs these in order:

1. **Structure**: the tables above. A structure error stops the check.
2. **Defaults**: each default suits its field.
3. **Publish checks** (only with `publish: true`): at least one field, no
   repeated keys, and a valid preview.

Use `publish: true` for any form people will fill in. Duplicate keys are
only caught by the publish checks.

## The text format

The same schema can be written as text, which is shorter to read and write.
`schema_from_text` and `schema_to_text` (or `feedbakkr text`) convert
between the two without losing anything.

```text
@version 1
@title Contact us
@description We reply within two working days.
@preview name, topic separator=" · "

name: text "Your name" required min=1 max=100
email: email "Email" required
topic: fixed "What is it about?" required default=other
  - order "An order"
  - partnership "Working together"
  - other "Something else"
message: textarea "Message" required min=10 max=2000
source_page: url "Page" hidden
dishes: dynlist "Dishes you tried" maxItems=5
  item dish: text "Dish" required max=100
```

- `@` lines set the title, description and preview (`@preview auto`,
  `@preview none`, or field keys with `separator=`, `maxLength=`,
  `fallback=a,b` and `prefix="..."`).
- A field line is `key: type "label"` then flags (`required`, `optional`,
  `hidden`, `sensitive`) and settings (`min=`, `max=`, `maxItems=`,
  `default=`, `meta="..."`).
- Indented `- key "Label"` lines are the options of a `fixed` field, or of a
  list's `fixed` item.
- An indented `item key:` line is a list's item, written like a field line.
- Quoted text may contain `\"` and `\\`. List or object defaults are JSON:
  `default=["a","b"]`.
- Blank lines and lines starting with `#` are ignored.

## Writing a good form

- Ask only what you need. Every field is a reason not to finish.
- Labels are plain questions or nouns a person understands without help.
- Make a field required only when the form is useless without it, and give
  required text a `min`.
- Use `fixed` when the answers are known, so they can be counted and
  filtered.
- Use `hidden` fields for context the page knows (page, product, campaign),
  not for questions.
- Set `max` on free text so answers stay a sensible size.
- Set a custom `preview` naming the field that best identifies a
  submission, usually a name or subject.
