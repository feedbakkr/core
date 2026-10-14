# FeedBakkr form schemas: a guide for writing them

A form is described by a **schema**: a JSON object listing its fields. The
same schema checks the form in the browser and the answers on the server.
This guide covers schema format v1, and v2, which adds conditions and
sections (see [Schema v2](#schema-v2-conditions-and-sections)). Write v1
unless the form needs them.

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

`req: true` means an answer must be given. A field without `req` may be
left out entirely.

The server checks answers with `validateSubmission` (the
`validate_submission` tool), which trims text and treats an empty or blank
answer as not given, so a blank answer to a required field is refused. It
also refuses answers to keys the schema does not list. `DynamicForm` and
`generateZod` follow FeedBakkr's older rules: a required `text` or
`textarea` accepts an empty string there, so give it `"min": 1` (or more)
when a real answer is needed, and unknown keys are dropped.

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

## Schema v2: conditions and sections

A v2 schema is v1 with `"v": 2` and up to four more things. Use it only when
the form needs one of them; FeedBakkr itself reads only v1.

```json
{
  "v": 2,
  "title": "Work with us",
  "fields": [
    { "k": "name", "label": "Your name", "t": "text", "req": true, "max": 100 },
    {
      "k": "kind", "label": "Enquiry type", "t": "fixed", "req": true,
      "opts": [{ "k": "supplier", "label": "I'm a supplier" }, { "k": "other", "label": "Something else" }]
    },
    {
      "k": "volume", "label": "Monthly volume", "t": "integer", "req": true, "min": 1,
      "help": "Roughly, in cases a month.",
      "when": { "k": "kind", "eq": "supplier" }
    },
    { "k": "details", "label": "Details", "t": "textarea", "req": true, "min": 10, "max": 2000, "placeholder": "Tell us more" }
  ],
  "sections": [
    { "id": "you", "title": "About you", "fields": ["name", "kind"] },
    { "id": "business", "title": "Your business", "fields": ["volume"], "when": { "k": "kind", "eq": "supplier" } },
    { "id": "request", "title": "Your request", "fields": ["details"] }
  ]
}
```

- **`when`** on a field: show and check it only when the condition holds.
  A field whose condition does not hold is never required, and its answer
  is dropped.
- **`sections`**: groups of fields, shown however the page chooses (one
  page, steps, slides). With sections, every field is in exactly one,
  listed in the same order as `fields`. A section can have a `when` too.
  Its `title` is optional: without one it is "Section 1", "Section 2"… by
  its place (`sectionTitle`), so the numbers follow any reordering. In text,
  `@section about` or `@section about "About you"`.
- **`help`** (up to 500 characters): guidance shown with the field.
- **`placeholder`** (up to 200): example text inside an empty input.
- **`replyTo: true`** on one `email` field: replies to the message go to
  this address (`prepareMessage` returns it as `replyTo`). Mark the field
  where the person gives their own address, not any email field. Without
  it, a message has no reply address from the form; who sent it (a
  signed-in user) is the app's to record, never read from the answers.
  In the text format: `email: email "Your email" required reply-to`.

A condition names a field that comes **before** it, and compares its answer:

| Condition | Holds when |
| --- | --- |
| `{ "k": "kind", "eq": "supplier" }` | The answer is this value. For a list, it contains it. |
| `{ "k": "kind", "neq": "other" }` | It is not this value (or there is no answer). |
| `{ "k": "kind", "in": ["supplier", "venue"] }` | It is one of these. |
| `{ "k": "phone", "filled": true }` | An answer was given. |
| `{ "k": "phone", "empty": true }` | No answer was given. |
| `{ "all": [ ... ] }`, `{ "any": [ ... ] }` | Every one, or at least one, of two or more conditions. |

Compared values must suit the field: an option key for `fixed`, `true` or
`false` for `bool`, a number for `number` and `integer`. A section's `when`
names only fields of earlier sections.

To check a v2 schema in code, pass `allowV2: true` to `validateSchema`.
`validate_schema` and `feedbakkr validate` accept both versions.

In the text format, start with `@version 2`, open each section with
`@section id "Title"`, and end a field line with `when <condition>`:

```text
@version 2
@title Work with us

@section you "About you"
name: text "Your name" required max=100
kind: fixed "Enquiry type" required
  - supplier "I'm a supplier"
  - other "Something else"
@section business "Your business" when kind = supplier
volume: integer "Monthly volume" required min=1 help="Roughly, in cases a month." when kind = supplier
@section request "Your request"
details: textarea "Details" required min=10 max=2000 placeholder="Tell us more"
```

Conditions in text: `kind = supplier`, `kind != other`,
`kind in [supplier, venue]`, `phone filled`, `phone empty`, joined with
`and` and `or` (`and` first; group with parentheses). Quote a value with
spaces, or one that would read as a number or `true`: `size = "12"`.

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
