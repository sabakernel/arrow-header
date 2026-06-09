// 026>PROTOCOLNAME.v1>TYPE(stringただしnumber推奨)>200>
// 最初の数字(LengthPrefix)はゼロ埋め contentSizeはゼロ埋めなし

// ContentSizeが0のときはしっかり0と書く 空文字はダメ

/**
 * The maximum number of digits for the initial number (LengthPrefix).
 */
export const MaxLengthPrefixDigit = 3; // 最初の数字(LengthPrefix)は3桁まで

/**
 * The maximum UTF-8 byte length of the entire header.
 * Represents the full length of strings like `029>PROTOCOLNAME.v1>TYPE>200>`.
 * Note that this length includes the initial LengthPrefix portion.
 * @see MaxLengthPrefixDigit
 */
export const MaxHeadSize = 126;

/**
 * The number of sections in the header (segments separated by `>`).
 *
 * A head is divided into four sections: (x>x>x>x>)
 */
export const HeadSectionNum = 4;

/**
 * Header information used as the output of `readHead` and the input of `buildHead`.
 * - `ContentVersion` and `ContentType` must not contain `>`.
 * - The total size must fit within `MaxHeadSize`.
 * @see MaxHeadSize
 */
export interface Head {
  /** Content version */
  ContentVersion: string;
  /** Content type */
  ContentType: string;
  /** Byte length of the following content (bigint ≥ 0) */
  ContentSize: bigint;
}

/*
 * UTF-8 byte utilities
 */

// UTF-8としてエンコードする
function encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

// UTF-8としてデコードする
function decode(b: Uint8Array): string {
  return new TextDecoder().decode(b);
}

// UTF-8としてサイズ計算する
function utf8ByteLength(b: Uint8Array): number {
  return b.length;
}

/**
 * Strictly validates a decimal digit string and converts it to an integer.
 * @throws {Error} If the input is negative, contains decimals, leading/trailing spaces, or non-digit characters.
 * @throws {Error} If it exceeds JavaScript's safe integer limit (Number.isSafeInteger).
 */
function parseStrictInt10(s: string): number {
  if (!/^\d+$/.test(s)) {
    throw new Error(`invalid int format: "${s}"`);
  }

  const n = Number(s);

  if (!Number.isSafeInteger(n)) {
    throw new Error(`int overflow or unsafe: "${s}"`);
  }

  return n;
}

/**
 * Parses a numeric string as a non-negative int64 (bigint).
 * Behaves like Go's `strconv.ParseInt(s, 10, 64)` but restricted to non-negative values ("0" is allowed).
 * @throws {Error} If the input is empty, contains non-integer characters, or contains a decimal point.
 * @throws {Error} If it exceeds the int64 range (0 to 2^63 - 1).
 */
function parsePositiveInt64(s: string): bigint {
  // 負の値はここでエラー
  if (!/^\d+$/.test(s)) {
    throw new Error(`failed to parse int64: "${s}"`);
  }

  let value: bigint;

  try {
    value = BigInt(s);
  } catch {
    throw new Error(`failed to parse int64: "${s}"`);
  }

  const minInt64 = -(2n ** 63n);
  const maxInt64 = 2n ** 63n - 1n;

  if (value < minInt64 || value > maxInt64) {
    throw new Error(`int64 overflow: "${s}"`);
  }

  return value;
}

/**
 * Builds a header string compliant with the specification from a Head object.
 * Header length is always calculated based on UTF-8 byte length, not character count.
 * @param {Head} h - The header information to build from.
 * @returns {string} A header string starting with a zero-padded 3-digit length prefix.
 * @throws {Error} If `ContentVersion` or `ContentType` contains `>`.
 * @throws {Error} If `ContentSize` is negative.
 * @throws {Error} If the total byte length of the built header exceeds `MaxHeadSize`.
 * @see MaxHeadSize
 */
export function buildHead(h: Head): string {
  if (h.ContentVersion.includes('>')) {
    throw new Error('invalid contentVersion');
  }

  if (h.ContentType.includes('>')) {
    throw new Error('invalid contentType');
  }

  if (h.ContentSize < 0n) {
    throw new Error(`contentSize must be positive: ${h.ContentSize}`);
  }

  const contentSize = h.ContentSize.toString();

  // ヘッダ本体（prefixを除く部分）
  const t = `>${h.ContentVersion}>${h.ContentType}>${contentSize}>`;

  const tBytes = encode(t);

  // Headの長さ(最初の数字も含む)
  const headLen = MaxLengthPrefixDigit + utf8ByteLength(tBytes);

  if (headLen > MaxHeadSize) {
    throw new Error(`total head size: ${headLen} exceeds the limit.`);
  }

  const prefix = headLen.toString().padStart(MaxLengthPrefixDigit, '0');

  return prefix + t;
}

/**
 * Parses and extracts the header portion (Head) from a string.
 * The input may include data after the header (such as content body), but parsing is based on the initial prefix length.
 * @param {string} s - The string to parse.
 * @returns {Head} The parsed header object.
 * @throws {Error} If the input string is empty.
 * @throws {Error} If the length prefix is not a zero-padded 3-digit number or cannot be parsed as a number.
 * @throws {Error} If the input string's byte length is less than the header length specified by the prefix.
 * @throws {Error} If the number of header delimiters (`>`) is invalid.
 * @throws {Error} If `ContentSize` has unnecessary zero-padding (e.g. "020"), or is negative or non-numeric.
 * @see HeadSectionNum
 */
function getHeadSize(s: string): number {
  const bytes = encode(s);

  // prefix + ">" までを見る
  const searchLimit = MaxLengthPrefixDigit + 1;
  const sliced = bytes.slice(0, Math.min(bytes.length, searchLimit));

  const s2 = decode(sliced);

  const idx = s2.indexOf('>');

  // '>' が見つからない(桁数が超えている可能性もあり)
  if (idx <= 0) {
    throw new Error("delimiter '>' not found. probably over the limit.");
  }

  const head = s2.slice(0, idx);

  // ゼロ埋めのためサイズが揃っているか検証
  if (head.length !== MaxLengthPrefixDigit) {
    throw new Error('invalid length prefix');
  }

  let headLen: number;

  try {
    headLen = parseStrictInt10(head);
  } catch {
    throw new Error('failed to parse header length');
  }

  if (!Number.isFinite(headLen)) {
    throw new Error('failed to parse header length');
  }

  if (headLen <= 0) {
    throw new Error(`length must be positive: ${headLen}`);
  }

  if (headLen > MaxHeadSize) {
    throw new Error(`head size must be <= ${MaxHeadSize} but got ${headLen}`);
  }

  return headLen;
}

/**
 * Parses and extracts the header portion (Head) from a string.
 * The input string can include additional data after the header, such as content.
 * @param {string} s - The string to parse (may include data after the header).
 * @returns {Head} The parsed header object.
 * @throws {Error} If the header format is invalid.
 * @throws {Error} If ContentSize is invalid.
 * @see HeadSectionNum
 */
export function readHead(s: string): Head {
  const bytes = new TextEncoder().encode(s);
  if (bytes.length === 0) {
    throw new Error('empty input');
  }

  const headLen = getHeadSize(s);

  // byte長チェック
  if (bytes.length < headLen) {
    throw new Error(`input string is smaller than headLen: ${headLen}`);
  }

  const headBytes = bytes.slice(0, headLen);
  const headString = decode(headBytes);

  const parts = headString.split('>');

  // 要素数のチェック(">"で区切られた区間が4+1つ)
  if (parts.length !== HeadSectionNum + 1) {
    throw new Error('invalid header structure');
  }

  const contentSizeStr = parts[3];

  // "0" 単体ならセーフ、それ以外の "0123" などのゼロ埋めはアウト
  if (contentSizeStr.startsWith('0') && contentSizeStr !== '0') {
    throw new Error('contentSize starts with "0"');
  }

  let contentSize: bigint;

  try {
    contentSize = parsePositiveInt64(contentSizeStr);
  } catch {
    throw new Error('invalid contentSize');
  }

  return {
    ContentVersion: parts[1],
    ContentType: parts[2],
    ContentSize: contentSize,
  };
}
