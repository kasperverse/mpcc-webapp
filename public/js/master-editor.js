/**
 * MPCC - マスタ編集モジュール
 * CSVテキストの解析・バリデーション・localStorage保存を担う
 */

import { INITIAL_MASTER, saveCustomMaster, resetToInitialMaster } from './master.js';

// ============================================================
// CSV フォーマット仕様
// ============================================================
// 必須列：商品コード, 商品名, 1ケースあたり個数
// 任意列：別名1, 別名2, ...（4列目以降はすべて別名として扱う）
//
// 例（ヘッダーあり）:
//   商品コード,商品名,1ケースあたり個数,別名1
//   412294,プラス糀 生塩糀,32
//   412310,プラス糀 生塩糀パウダーボトル,24,プラス糀 生塩糀パウダー ボトル
//
// 例（ヘッダーなし）:
//   412294,プラス糀 生塩糀,32
// ============================================================

/**
 * CSV/TSVテキストを解析して商品マスタ配列に変換する
 * @param {string} text - 貼り付けられたCSV/TSVテキスト
 * @returns {{ data: Array, errors: Array, warnings: Array }}
 */
export function parseCsvToMaster(text) {
  const errors = [];
  const warnings = [];
  const data = [];

  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length === 0) {
    errors.push('入力が空です。');
    return { data, errors, warnings };
  }

  // ヘッダー行の自動検出（1行目に「商品コード」「コード」などが含まれるか）
  const firstLine = lines[0];
  const isHeader = /商品コード|コード|code|品番/i.test(firstLine) &&
                   !/^\d{5,7}/.test(firstLine);
  const startIndex = isHeader ? 1 : 0;

  if (isHeader) {
    warnings.push(`1行目をヘッダーとして読み飛ばしました：「${firstLine}」`);
  }

  const codeSet = new Set();

  for (let i = startIndex; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i];

    // コメント行をスキップ（# で始まる行）
    if (line.startsWith('#')) continue;

    // 区切り文字の自動判定（タブ優先、次にカンマ）
    const sep = line.includes('\t') ? '\t' : ',';
    const cols = splitCsvLine(line, sep);

    if (cols.length < 3) {
      errors.push(`${lineNo}行目：列数が足りません（最低3列必要：コード, 商品名, 個数）→ 「${line}」`);
      continue;
    }

    const rawCode    = cols[0].trim().replace(/['"　]/g, '');
    const rawName    = cols[1].trim().replace(/^["']|["']$/g, '');
    const rawPerCase = cols[2].trim().replace(/[^0-9]/g, '');
    const rawAliases = cols.slice(3).map(a => a.trim().replace(/^["']|["']$/g, '')).filter(a => a);

    // コードのバリデーション
    if (!/^\d{5,7}$/.test(rawCode)) {
      errors.push(`${lineNo}行目：商品コードが無効です（5〜7桁の数字が必要）→ 「${rawCode}」`);
      continue;
    }

    // 商品名のバリデーション
    if (!rawName) {
      errors.push(`${lineNo}行目：商品名が空です。`);
      continue;
    }
    if (rawName.length > 80) {
      warnings.push(`${lineNo}行目：商品名が長すぎます（80文字以下推奨）→ 「${rawName}」`);
    }

    // 個数のバリデーション
    const perCase = parseInt(rawPerCase, 10);
    if (isNaN(perCase) || perCase < 1 || perCase > 9999) {
      errors.push(`${lineNo}行目：1ケースあたり個数が無効です（1〜9999の整数が必要）→ 「${cols[2].trim()}」`);
      continue;
    }

    // コード重複チェック
    if (codeSet.has(rawCode)) {
      warnings.push(`${lineNo}行目：商品コード「${rawCode}」が重複しています。後の行を優先します。`);
      // 既存データを上書きするため削除
      const idx = data.findIndex(d => d.code === rawCode);
      if (idx !== -1) data.splice(idx, 1);
    }
    codeSet.add(rawCode);

    data.push({
      code:    rawCode,
      name:    rawName,
      perCase: perCase,
      aliases: rawAliases
    });
  }

  if (data.length === 0 && errors.length === 0) {
    errors.push('有効なデータ行が1件もありませんでした。');
  }

  return { data, errors, warnings };
}

/**
 * CSVの1行を分割する（クォート対応）
 * @param {string} line
 * @param {string} sep
 * @returns {string[]}
 */
function splitCsvLine(line, sep) {
  const result = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' || ch === "'") {
      inQuote = !inQuote;
    } else if (ch === sep && !inQuote) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/**
 * マスタ配列をCSV文字列に変換（ダウンロード用）
 * @param {Array} master
 * @returns {string}
 */
export function masterToCsv(master) {
  const header = '商品コード,商品名,1ケースあたり個数,別名1,別名2';
  const rows = master.map(p => {
    const cols = [
      p.code,
      `"${p.name}"`,
      p.perCase,
      ...(p.aliases || []).map(a => `"${a}"`)
    ];
    return cols.join(',');
  });
  return [header, ...rows].join('\n');
}

/**
 * カスタムマスタを保存する（バリデーション済みデータを受け取る）
 * @param {Array} data
 */
export function applyCustomMaster(data) {
  saveCustomMaster(data);
}

/**
 * 初期マスタに戻す
 */
export function applyInitialMaster() {
  resetToInitialMaster();
}

/**
 * 初期マスタをCSV形式で返す（テンプレートダウンロード用）
 */
export function getInitialMasterAsCsv() {
  return masterToCsv(INITIAL_MASTER);
}
