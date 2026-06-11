# arrow-header

[![JSR](https://jsr.io/badges/@sabakernel/arrow-header)](https://jsr.io/@sabakernel/arrow-header)

JSR: https://jsr.io/@sabakernel/arrow-header

---
Japanese version: [README.ja.md](README.ja.md)

Note: This English README was produced using machine translation. Please refer to the Japanese
original above for the authoritative text.

`arrow-header` is a small library to parse and build a custom fixed-length header format separated
by the `>` character, for example:

```
029>PROTOCOLNAME.v1>TYPE>200>
```

## Features

- Pure Deno, zero external dependencies — runs on the standard runtime only.
- Strict validation: checks for length mismatches, prohibited zero-padding, Int64 overflow, invalid
  delimiters, and other format violations.
- Multibyte (Japanese) safe: header sizes are calculated using UTF-8 byte length, not character
  count.
- Stream-friendly: can extract the header portion even when the input string contains the body
  (content) appended after the header.
- BigInt support: `ContentSize` is treated as a `bigint` (positive Int64 range), so large payloads
  are supported.
---

## Usage

### 1. Build a header (`buildHead`)

Assemble a header string from a `Head` object. The function automatically prefixes the total byte
length (zero-padded).

```ts
const head: Head = {
  ContentVersion: 'PROTOCOLNAME.v1',
  ContentType: 'JSON',
  ContentSize: 200n,
};

const headerString = buildHead(head);
console.log(headerString);
// Output: 029>PROTOCOLNAME.v1>JSON>200>
```

### 2. Read a header (`readHead`)

Parse the header portion from a string and return it as an object. The function tolerates additional
data (the content body) appended after the header.

```ts
const input = '029>PROTOCOLNAME.v1>JSON>200>{"message":"hello"}';

const head = readHead(input);
console.log(head);
/*
Output:
{
  ContentVersion: "PROTOCOLNAME.v1",
  ContentType: "JSON",
  ContentSize: 200n
}
*/
```

---

## Limitations

- **MaxHeadSize (126 bytes)**: The total header length including the initial length prefix
  (LengthPrefix) must not exceed 126 bytes.
- **Forbidden character**: `ContentVersion` and `ContentType` must not contain the delimiter
  character `>`.
- **Zero-padding rules**:
  - The leading header length (`LengthPrefix`) must always be three digits, zero-padded (for example
    `029`).
  - `ContentSize` must not have unnecessary leading zeros (for example `020` is invalid), except the
    single value `0` is allowed.

```
029 > PROTOCOLNAME.v1 > TYPE > 200 > (followed by data...)
 [--]   [------------]   [--]   [-]
  |           |           |      |
  |           |           |      +-- ContentSize   (bytes / no zero-padding)
  |           |           +--------- ContentType   ('>' not allowed)
  |           +--------------------- ContentVersion ('>' not allowed)
  +--------------------------------- LengthPrefix  (total length / 3 digits)

  └─────────────── Maximum 126 bytes (MaxHeadSize) ───────────────┘
```

## Why `>`?

- Avoid conflicts with JSON and other payloads: using `,` could cause parsing ambiguities with
  content that follows immediately after the header (for example JSON), so `>` reduces
  boundary-guessing risks.
- Readability: the pipe character `|` can be visually confused with `1`, `l`, or `I` in some fonts;
  `>` offers better clarity while debugging.
- Stream semantics: in streaming scenarios like `Header -> Content -> Header...`, `>` reads
  naturally as an arrow/separator between segments.
