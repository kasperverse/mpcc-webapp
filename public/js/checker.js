/**
 * MPCC - 判定ロジックモジュール
 * パース済みデータをマスタと照合し、判定結果を返す
 */

import {
  PRODUCT_MASTER,
  getActiveMaster,
  findByCode,
  findByNormalizedName,
  normalizeName,
  checkSimilarNameWarning,
  levenshteinSimilarity
} from './master.js';

/**
 * 判定ステータス定数
 */
export const STATUS = {
  OK: 'ok',
  WARNING: 'warning',
  ERROR: 'error',
  UNKNOWN: 'unknown',
  PARSE_ERROR: 'parse_error'
};

/**
 * 1件のパース済みデータを判定する
 * @param {object} parsed - parseLine()の戻り値
 * @returns {object} 判定結果
 */
export function checkItem(parsed) {
  const result = {
    raw: parsed.raw,
    productName: parsed.productName,
    code: parsed.code,
    cases: parsed.cases,
    quantity: parsed.quantity,
    status: STATUS.OK,
    statusLabel: '問題なし',
    messages: [],
    expectedQuantity: null,
    masterProduct: null,
    isUnknown: false,
    externalSearchResult: null
  };

  // パースエラーがある場合
  if (parsed.parseError) {
    result.status = STATUS.PARSE_ERROR;
    result.statusLabel = '解析エラー';
    result.messages.push({
      type: 'error',
      text: `入力形式を正しく解析できませんでした：${parsed.parseError}`
    });
    return result;
  }

  // ケース数・入り数が取れていない場合
  if (!parsed.cases || !parsed.quantity) {
    result.status = STATUS.PARSE_ERROR;
    result.statusLabel = '解析エラー';
    result.messages.push({
      type: 'error',
      text: 'ケース数または入り数が読み取れませんでした。入力フォーマットを確認してください'
    });
    return result;
  }

  // コードでマスタ検索
  let masterProduct = parsed.code ? findByCode(parsed.code) : null;

  // コードが見つからない場合、名前でも検索を試みる
  if (!masterProduct && parsed.productName) {
    masterProduct = findByNormalizedName(normalizeName(parsed.productName));
  }

  // 未知商品
  if (!masterProduct) {
    result.status = STATUS.UNKNOWN;
    result.statusLabel = '未知商品';
    result.isUnknown = true;
    result.messages.push({
      type: 'unknown',
      text: `過去事例がない商品です。https://www.marukome.co.jp/business/product/ でお調べします`
    });
    // 未知商品の外部参照結果はcheckItem呼び出し後に非同期で取得
    return result;
  }

  result.masterProduct = masterProduct;

  // 期待される入り数を計算
  const expectedQuantity = parsed.cases * masterProduct.perCase;
  result.expectedQuantity = expectedQuantity;

  // === 判定A: 表記ゆれチェック ===
  const inputNameNorm = parsed.productName ? normalizeName(parsed.productName) : null;
  const masterNameNorm = normalizeName(masterProduct.name);

  let nameVariantWarning = false;
  let nameVariantDetail = null;

  if (inputNameNorm && inputNameNorm !== masterNameNorm) {
    // エイリアスとも照合
    const matchedAlias = masterProduct.aliases.find(
      a => normalizeName(a) === inputNameNorm
    );

    if (matchedAlias) {
      // エイリアスに一致 = 既知の表記ゆれ → 必ず「注意」として表示
      nameVariantWarning = true;
      nameVariantDetail = {
        inputName: parsed.productName,
        masterName: masterProduct.name,
        isKnownAlias: true
      };
    } else {
      // エイリアスにも一致しない → 類似度で判断
      const similarity = levenshteinSimilarity(inputNameNorm, masterNameNorm);
      if (similarity > 0.7) {
        // 類似度が高い = 表記ゆれの可能性
        nameVariantWarning = true;
        nameVariantDetail = {
          inputName: parsed.productName,
          masterName: masterProduct.name,
          isKnownAlias: false
        };
      } else {
        // 類似度が低い = コードと名前の組み合わせが怪しい
        // 入力名称で全マスタ検索して別商品が近ければ「取り違え注意」
        const closeMatch = findClosestProduct(inputNameNorm, masterProduct.code);
        if (closeMatch) {
          result.status = STATUS.WARNING;
          result.statusLabel = '注意';
          result.messages.push({
            type: 'warning',
            text: `商品名または商品コードの取り違えの可能性があります`,
            detail: `コード「${parsed.code}」は「${masterProduct.name}」ですが、入力名「${parsed.productName}」は「${closeMatch.name}（${closeMatch.code}）」に近い可能性があります`
          });
        }
      }
    }
  }

  // === 判定B: 類似名称注意 ===
  const similarWarning = parsed.productName
    ? checkSimilarNameWarning(parsed.code, parsed.productName)
    : null;

  if (similarWarning) {
    if (result.status === STATUS.OK) result.status = STATUS.WARNING;
    result.statusLabel = '注意';
    result.messages.push({
      type: 'warning',
      text: similarWarning.warning,
      detail: similarWarning.partnerName
        ? `類似商品：「${similarWarning.partnerName}」（コード：${similarWarning.partnerCode}）`
        : null
    });
  }

  // === 判定C: ケース数・入り数の整合性 ===
  if (parsed.quantity !== expectedQuantity) {
    result.status = STATUS.ERROR;
    result.statusLabel = 'エラー';
    result.messages.push({
      type: 'error',
      text: `必要なケース数または必要な入り数が誤っている可能性があります`,
      detail: `この商品は1ケースあたり${masterProduct.perCase}個のため、${parsed.cases}ケースなら${expectedQuantity}が想定されます（入力値：${parsed.quantity}）`
    });
  }

  // 表記ゆれ警告を追加（エラーより後に追加してエラー優先）
  if (nameVariantWarning && nameVariantDetail) {
    if (result.status === STATUS.OK) {
      result.status = STATUS.WARNING;
      result.statusLabel = '注意';
    }
    const mainText = nameVariantDetail.isKnownAlias
      ? `商品名の表記ゆれが検出されました（既知の別表記）`
      : `商品名の表記ゆれの可能性があります`;
    result.messages.push({
      type: 'warning',
      text: mainText,
      detail: `正式な表記：「${nameVariantDetail.masterName}」`
    });
  }

  // 問題なしの場合
  if (result.messages.length === 0) {
    result.status = STATUS.OK;
    result.statusLabel = '問題なし';
    result.messages.push({
      type: 'ok',
      text: '問題は見つかりませんでした'
    });
  }

  return result;
}

/**
 * 入力名称に最も近い別商品を探す（取り違え検出用）
 * @param {string} normalizedName - 正規化済み入力名
 * @param {string} excludeCode - 除外コード（照合中の商品）
 */
function findClosestProduct(normalizedName, excludeCode) {
  let best = null;
  let bestSim = 0.65; // しきい値
  for (const p of getActiveMaster()) {
    if (p.code === excludeCode) continue;
    const sim = levenshteinSimilarity(normalizedName, normalizeName(p.name));
    if (sim > bestSim) {
      bestSim = sim;
      best = p;
    }
  }
  return best;
}

/**
 * 全件まとめてチェック
 * @param {Array} parsedItems - parseMultiLine()の戻り値
 * @returns {Array} 判定結果配列
 */
export function checkAll(parsedItems) {
  return parsedItems.map(item => checkItem(item));
}

/**
 * サマリーを計算
 */
export function calcSummary(results) {
  return {
    total: results.length,
    ok: results.filter(r => r.status === STATUS.OK).length,
    warning: results.filter(r => r.status === STATUS.WARNING).length,
    error: results.filter(r => r.status === STATUS.ERROR).length,
    unknown: results.filter(r => r.status === STATUS.UNKNOWN).length,
    parseError: results.filter(r => r.status === STATUS.PARSE_ERROR).length
  };
}
