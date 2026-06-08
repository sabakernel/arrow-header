import { buildHead, MaxHeadSize, readHead } from '../mod.ts';
import { assertEquals, assertThrows } from '@std/assert';

Deno.test('Head RoundTrip', () => {
  const h = {
    ContentVersion: 'PROTOCOLNAME.v1',
    ContentType: 'TYPE',
    ContentSize: 200n,
  };

  const s = buildHead(h);
  const got = readHead(s);

  assertEquals(got.ContentVersion, h.ContentVersion, 'version mismatch');
  assertEquals(got.ContentType, h.ContentType, 'type mismatch');
  assertEquals(got.ContentSize, h.ContentSize, 'size mismatch');
});

// 2桁なのに3桁扱い(ゼロ埋めされていない)
Deno.test('Head InvalidLengthPrefix', () => {
  const s = '29>PROTOCOLNAME.v1>TYPE>200>';

  assertThrows(
    () => readHead(s),
    Error,
    'invalid length prefix',
  );
});

// LengthPrefixに数字以外が混ざっているとき
Deno.test('Head NonNumericLengthPrefix', () => {
  const s = 'XYZ>PROTOCOLNAME.v1>TYPE>200>';
  assertThrows(
    () => readHead(s),
    Error,
    'failed to parse header length',
  );
});

// ">" が足りないとき
Deno.test('Head InvalidSectionCount', () => {
  const s = '028>PROTOCOLNAME.v1>TYPE>200';

  assertThrows(
    () => readHead(s),
    Error,
    'invalid header structure',
  );
});

// Contentの長さの書き方が不正なとき
Deno.test('Head InvalidContentSize', () => {
  const s = '029>PROTOCOLNAME.v1>TYPE>ABC>';

  assertThrows(
    () => readHead(s),
    Error,
    'invalid contentSize',
  );
});

// LengthPrefixが0のとき
Deno.test('Head LengthPrefix=0', () => {
  const s = '000>PROTOCOLNAME.v1>TYPE>200>';

  assertThrows(
    () => readHead(s),
    Error,
    'length must be positive: 0',
  );
});

// // LengthPrefix部分の数値系の異常
// Deno.test("Head InvalidContentSize (multiple cases)", () => {
//   const cases: string[] = ["-10", "999"]; // 000は含めない

//   for (const num of cases) {
//     const s = `${num}>PROTOCOLNAME.v1>TYPE>ABC>`;

//     assertThrows(
//       () => readHead(s),
//       Error,
//       "failed to parse header length",
//     );
//   }
// });

// Buildのチェック
Deno.test('Head BuildFormat', () => {
  const h = {
    ContentVersion: 'PROTOCOLNAME.v1',
    ContentType: 'TYPE',
    ContentSize: 200n,
  };

  const s = buildHead(h);

  if (s.length === 0) {
    throw new Error('empty result');
  }

  if (!s.endsWith('>')) {
    throw new Error("must end with '>'");
  }
});

// ContentVersionに'>'が入っているとき
Deno.test("Head VersionContains'>'", () => {
  const h = {
    ContentVersion: 'PROTOCOLNAME.v1>',
    ContentType: 'TYPE',
    ContentSize: 200n,
  };

  assertThrows(
    () => buildHead(h),
    Error,
    'invalid contentVersion',
  );
});

// ContentVersionに'>'が入っているとき
Deno.test("Head TypeContains'>'", () => {
  const h = {
    ContentVersion: 'PROTOCOLNAME.v1',
    ContentType: 'TYPE>',
    ContentSize: 200n,
  };

  assertThrows(
    () => buildHead(h),
    Error,
    'invalid contentType',
  );
});

// 日本語入り
Deno.test('Head WithJapanese', () => {
  const h = {
    ContentVersion: 'プロトコルネーム.v1',
    ContentType: 'タイプ',
    ContentSize: 200n,
  };

  const s = buildHead(h);

  // ちゃんと文字列が返ること
  assertEquals(s, '046>プロトコルネーム.v1>タイプ>200>'); // utf-8バイト列での長さを書くこと
});

// Headの最大サイズを超すとき
Deno.test('Head MaxSize boundary', () => {
  const h = {
    ContentVersion: 'A'.repeat(10),
    ContentType: 'B'.repeat(10),
    ContentSize: 1n,
  };

  const s = buildHead(h);

  if (new TextEncoder().encode(s).length > MaxHeadSize) {
    throw new Error('exceeds max head size');
  }
});

// LengthPrefixDigitが4ケタのとき
Deno.test('Head 4digitLengthPrefixDigit', () => {
  const s = '0029>PROTOCOLNAME.v1>TYPE>200>';

  assertThrows(
    () => readHead(s),
    Error,
    "delimiter '>' not found. probably over the limit.",
  );
});

// 何も入っていないとき
Deno.test('Head EmptyInput', () => {
  assertThrows(
    () => readHead(''),
    Error,
    'empty input',
  );
});

// LengthPrefixがJSのnumber型の最大値を超えたときはparseStrictInt10()の"int overflow or unsafe: ${num}""がエラーにするが、
// 実際には桁の時点で"delimiter '>' not found. probably over the limit."エラーが発生する。

// ContentSizeが0スタートだったとき
Deno.test("Head ContentSizeStartWith'0'", () => {
  const s = '029>PROTOCOLNAME.v1>TYPE>020>';
  assertThrows(
    () => readHead(s),
    Error,
    'contentSize starts with "0"',
  );
});

// ContentSizeが0のみ（単体の0）のとき
Deno.test('Head ContentSizeIsZero', () => {
  const h = {
    ContentVersion: 'PROTOCOLNAME.v1',
    ContentType: 'TYPE',
    ContentSize: 0n,
  };

  const s = buildHead(h);
  assertEquals(s, '027>PROTOCOLNAME.v1>TYPE>0>', 'errors in the generated results');

  // エラーにならず、正常に読み込めること
  const got = readHead(s);

  // ContentSize が BigInt の 0n になっていることを確認
  assertEquals(got.ContentSize, 0n, 'size should be 0n');
  // 全体が元通りに復元されているか
  assertEquals(got, h, 'The decrypted object should match the original');
});

// ContentSizeが負の値だったとき
Deno.test('Head NegativeContentSize', () => {
  const s = '030>PROTOCOLNAME.v1>TYPE>-200>';
  assertThrows(
    () => readHead(s),
    Error,
    'invalid contentSize',
  );
});
