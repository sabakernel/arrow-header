# arrow-header

`029>PROTOCOLNAME.v1>TYPE>200>` のような `>`
で区切られた独自の固定長ヘッダーをパース・生成するライブラリです。

## 特徴

- **純Deno製・外部依存なし**: 標準ランタイムの機能のみで動作します。
- **堅牢なバリデーション**:
  桁数のズレ、不要なゼロ埋め、Int64のオーバーフロー、不正なデリミタなどを厳格にチェックします。
- **マルチバイト（日本語）対応**: 文字数ではなく、UTF-8の **バイト長**
  を基準にヘッダサイズを正確に計算します。
- **ストリームフレンドリー**:
  入力文字列にヘッダ以降のデータ（コンテンツ本体など）が結合されていても、ヘッダ部分だけを正確に切り出せます。
- **BigIntサポート**: `ContentSize` は
  `bigint`（Int64の正の数の範囲）として扱うため、大容量データにも対応できます。

---

## 使い方

### 1. ヘッダーの生成 (`buildHead`)

`Head`
オブジェクトから、プロトコル仕様に準拠した文字列を組み立てます。先頭にはゼロ埋めされた全体バイト長が自動で付与されます。

```typescript
const head: Head = {
  ContentVersion: 'PROTOCOLNAME.v1',
  ContentType: 'JSON',
  ContentSize: 200n,
};

const headerString = buildHead(head);
console.log(headerString);
// 出力: 029>PROTOCOLNAME.v1>JSON>200>
```

### 2. ヘッダーの解析 (`readHead`)

文字列からヘッダ部分を解析し、オブジェクトとして抽出します。後ろにコンテンツ本体がくっついていても問題ありません。

```typescript
const input = "029>PROTOCOLNAME.v1>JSON>200>{"message":"hello"}";

const head = readHead(input);
console.log(head);
/*
出力:
{
  ContentVersion: "PROTOCOLNAME.v1",
  ContentType: "JSON",
  ContentSize: 200n
}
*/
```

---

## 制限事項

- **`MaxHeadSize` (126バイト)**:
  最初の数字（LengthPrefix）を含めたヘッダ全体の長さは最大126バイトまでです。
- **禁止文字**: `ContentVersion` と `ContentType` には、区切り文字である `>`
  を含めることはできません。
- **ゼロ埋めのルール**:
- 先頭のヘッダ長（LengthPrefix）は、常に3桁でゼロ埋めされている必要があります（例: `029`）。
- `ContentSize` には不要なゼロ埋め（例: `020`）は許容されません（ただし、単体の `0`
  は許容されます）。

```text
029 > PROTOCOLNAME.v1 > TYPE > 200 > (後続データ...)
 [--]   [------------]   [--]   [-]
  |           |           |      |
  |           |           |      +-- ContentSize   (バイト数/ゼロ埋め不可)
  |           |           +--------- ContentType   ('>'不可)
  |           +--------------------- ContentVersion('>'不可)
  +--------------------------------- LengthPrefix  (全体長/3桁固定)

  └─────────────── 最大 126 バイト (MaxHeadSize) ───────────────┘
```

## なぜ `>` なのか

- **JSONなどとの衝突回避**:
  `,`（カンマ）にしてしまうと、ヘッダーの直後に続くコンテンツ本体（JSONなど）のパース時に、境界の誤判定やバグを引き起こすリスクが高まるため。
- **視認性**: `|`（パイプ）は、フォントによっては数字の `1` やアルファベットの
  `l`（エル）、`I`（アイ）と視覚的に誤認しやすく、デバッグ時のストレスになるため。
- **ストリームの表現**: `Header -> Content -> Header...`
  と連続するデータ構造において、次へ進む『矢印』としての意味もあります。
