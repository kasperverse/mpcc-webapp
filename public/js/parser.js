/**
 * MPCC - 入力解析モジュール
 * 1行の入力テキストを解析し、商品名・コード・ケース数・入り数を抽出する
 */

/**
 * 1行を解析してオブジェクトを返す
 * フォーマット：商品名（商品コード）：ケース数ケース：入り数（個）
 *
 * 許容するパターン例：
 * - プラス糀 生塩糀(412294)：2ケース：64
 * - プラス糀 生塩糀（412294）:2ケース:64
 * - 業務用 プラス糀 米糀粉末（764860）：4ケース（40個）
 * - プラス糀 糀甘酒LL 糀リッチ粒（412171）2ケース：12
 * - プラス糀 生塩糀 （412294）2ケース：64
 *
 * @param {string} line - 1行のテキスト
 * @returns {{ raw, productName, code, cases, quantity, parseError } | null}
 */
export function parseLine(line) {
  const raw = line.trim();
  if (!raw) return null;

  // 全角→半角の正規化（解析用）
  const normalized = normalizeForParsing(raw);

  // パターン1: 商品名(コード)：ケース数ケース：入り数
  // コード部分を抽出: (...) または （...）の中の数字6桁
  const codeMatch = normalized.match(/\((\d{5,7})\)/);
  const code = codeMatch ? codeMatch[1] : null;

  // コード部分の前を商品名とする
  let productName = null;
  if (codeMatch) {
    const beforeCode = normalized.slice(0, normalized.indexOf(codeMatch[0]));
    productName = beforeCode.replace(/\s+$/g, '').trim();
  }

  // コードの後ろを解析してケース数・入り数を取得
  let remainder = normalized;
  if (codeMatch) {
    remainder = normalized.slice(normalized.indexOf(codeMatch[0]) + codeMatch[0].length);
  }

  // セパレータ正規化（コロン系）：: or ：→ |
  // remainder からケース数と入り数を抽出
  // パターン: [セパレータ]数字ケース[セパレータ]数字[個]
  // セパレータは : または なし（直後に数字が来る場合）

  // ケース数
  let cases = null;
  let quantity = null;
  let parseError = null;

  // ケース数を抽出: コロン or 空白 or 直後 で「数字ケース」
  const casesMatch = remainder.match(/[:：\s]*(\d+)\s*ケース/);
  if (casesMatch) {
    cases = parseInt(casesMatch[1], 10);
    const afterCases = remainder.slice(remainder.indexOf(casesMatch[0]) + casesMatch[0].length);
    // 入り数を抽出: コロン or 空白 or カッコ で「数字[個]」
    const qtyMatch = afterCases.match(/[:：\s（(]*(\d+)\s*個?[）)]*\s*$/);
    if (qtyMatch) {
      quantity = parseInt(qtyMatch[1], 10);
    } else {
      // 入り数が見つからない場合、remainderの末尾にある数字を試みる
      const qtyMatch2 = afterCases.match(/[:：\s]*(\d+)\s*個?/);
      if (qtyMatch2) {
        quantity = parseInt(qtyMatch2[1], 10);
      }
    }
  }

  // コードが見つからない場合は、行全体をできる限り解析する
  if (!code) {
    // 数字が6桁程度のものがあればコード候補とする（名前との区別）
    // 例: 商品名だけ、またはコードなし入力
    // この場合は商品名のみで照合を試みる
    const altCodeMatch = normalized.match(/(\d{5,7})/);
    if (altCodeMatch) {
      // 数字部分をコードとして扱う
      const altCode = altCodeMatch[1];
      const beforeAlt = normalized.slice(0, normalized.indexOf(altCode)).replace(/[（(：:\s]+$/, '').trim();
      const afterAlt = normalized.slice(normalized.indexOf(altCode) + altCode.length);
      if (beforeAlt) {
        productName = beforeAlt;
      }
      const casesM = afterAlt.match(/[:：\s]*(\d+)\s*ケース/);
      if (casesM) {
        cases = parseInt(casesM[1], 10);
        const afterCases2 = afterAlt.slice(afterAlt.indexOf(casesM[0]) + casesM[0].length);
        const qtyM = afterCases2.match(/[:：\s（(]*(\d+)\s*個?/);
        if (qtyM) {
          quantity = parseInt(qtyM[1], 10);
        }
      }
      return {
        raw,
        productName: productName || null,
        code: altCode,
        cases,
        quantity,
        parseError: (!cases || !quantity) ? '入力フォーマットを正しく解析できませんでした' : null
      };
    }
    parseError = 'コードが見つかりません。入力フォーマットを確認してください';
  }

  if (code && (!cases || !quantity)) {
    parseError = 'ケース数または入り数が正しく読み取れませんでした';
  }

  return {
    raw,
    productName,
    code,
    cases,
    quantity,
    parseError
  };
}

/**
 * 解析用の正規化（全角→半角、スペース統一）
 */
function normalizeForParsing(text) {
  return text
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/：/g, ':')
    .replace(/　/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 複数行を一括解析
 * @param {string} input - 複数行テキスト
 * @returns {Array} パース結果配列
 */
export function parseMultiLine(input) {
  const lines = input.split('\n');
  const results = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = parseLine(trimmed);
    if (parsed) results.push(parsed);
  }
  return results;
}
