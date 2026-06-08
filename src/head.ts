// 026>PROTOCOLNAME.v1>TYPE(stringただしnumber推奨)>200>
// 最初の数字(LengthPrefix)はゼロ埋め contentSizeはゼロ埋めなし

// ContentSizeが0のときはしっかり0と書く 空文字はダメ

/**
 * 最初の数字（LengthPrefix）の最大桁数です。
 */
export const MaxLengthPrefixDigit = 3; // 最初の数字(LengthPrefix)は3桁まで

/**
 * ヘッダ全体のUTF-8（バイト単位）での最大長です。
 * `029>PROTOCOLNAME.v1>TYPE>200>` 全体の長さを表します。
 * 最初のLengthPrefix部分を含めた長さである点に注意してください。
 * @see MaxLengthPrefixDigit
 */
export const MaxHeadSize = 126;

/**
 * ヘッダ内のセクション数（`>` で区切られる区間の数）です。
 *
 * Headは4つの区間に分かれます。(x>x>x>x>)
 */
export const HeadSectionNum = 4;

/**
 * `readHead` の出力および `buildHead` の入力となるヘッダ情報です。
 * - `ContentVersion`, `ContentType` には `>` を含めてはいけません。
 * - 全体サイズが `MaxHeadSize` 以内に収まる必要があります。
 * @see MaxHeadSize
 */
export interface Head {
  /** コンテンツのバージョン */
  ContentVersion: string;
  /** コンテンツの種類 */
  ContentType: string;
  /** 後続するコンテンツのバイト数（0以上のbigint） */
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
 * 10進数の数字文字列を厳格にバリデーションして整数に変換します。
 * @throws {Error} 負の数、小数点、前後のスペース、文字混じりの場合
 * @throws {Error} JavaScriptの安全な整数の限界（Number.isSafeInteger）を超えた場合
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
 * 数字文字列を正の数（0以上）のint64（bigint）としてパースします。
 * Go言語の `strconv.ParseInt(s, 10, 64)` の正数制限版と同等の挙動をします（"0" は許容）。
 * @throws {Error} 空文字、整数以外の文字、小数点を含む場合
 * @throws {Error} int64 の範囲（0 〜 2^63 - 1）を超える場合
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
 * Headオブジェクトから、仕様に準拠したヘッダ文字列を組み立てます。
 * 日本語などのマルチバイト文字列が含まれる場合、文字数ではなく **UTF-8のバイト長** を基準にヘッダ長を計算します。
 * @param {Head} h - 組み立て元のヘッダ情報
 * @returns {string} 長さプレフィックス（ゼロ埋め3桁）から始まるヘッダ文字列
 * @throws {Error} `ContentVersion` または `ContentType` に `>` が含まれる場合
 * @throws {Error} `ContentSize` が負の値の場合
 * @throws {Error} 組み立てたヘッダの総バイト数が `MaxHeadSize` を超える場合
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
 * 文字列からヘッダ部分（Head）を解析して抽出します。
 * 入力文字列にヘッダ以降のデータ（コンテンツ本体など）が含まれていても、先頭のプレフィックス長に従って正しく解析されます。
 * @param {string} s - 解析対象の文字列
 * @returns {Head} 解析されたヘッダオブジェクト
 * @throws {Error} 入力文字列が空の場合
 * @throws {Error} 長さプレフィックスがゼロ埋め3桁でない場合、または数値としてパースできない場合
 * @throws {Error} 入力文字列のバイト長が、プレフィックスで指定されたヘッダ長に満たない場合
 * @throws {Error} ヘッダの区切り（`>`）の個数が不正な場合
 * @throws {Error} `ContentSize` に不要なゼロ埋め（例: `"020"`）がある場合、または負の数・数値以外の場合
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
 * 文字列からヘッダ部分（Head）を解析して抽出します。
 * 入力文字列にヘッダ以降のデータ（コンテンツ本体など）が含まれていても問題ありません。
 * @param {string} s - 解析対象の文字列（ヘッダ以降のデータを含んでいても可）
 * @returns {Head} 解析されたヘッダオブジェクト
 * @throws {Error} 入力文字列が空の場合
 * @throws {Error} 入力文字列のバイト長が、解析したヘッダ長（LengthPrefix）に満たない場合
 * @throws {Error} ヘッダの区切り（`>`）の個数が不正な場合
 * @throws {Error} `ContentSize` が不正（"0" 以外の不要なゼロ埋めがあるなど）な場合
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
  } catch (e) {
    throw new Error('invalid contentSize', {
      cause: e,
    });
  }

  return {
    ContentVersion: parts[1],
    ContentType: parts[2],
    ContentSize: contentSize,
  };
}
