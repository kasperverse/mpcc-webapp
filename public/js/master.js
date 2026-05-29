/**
 * MPCC - 商品マスタデータ
 * 学習済み商品マスタ（過去に整合確認済み）
 *
 * ランタイムマスタ：localStorage に保存されたデータがあれば優先して使用する。
 * PRODUCT_MASTER は「初期マスタ」として常に保持し、リセット時に参照する。
 */

export const STORAGE_KEY = 'mpcc_custom_master';

export const INITIAL_MASTER = [
  { code: "279803", name: "プラス糀 生みそ 糀美人熟甘", perCase: 8, aliases: [] },
  { code: "412110", name: "プラス糀 生塩糀 お徳用", perCase: 5, aliases: [] },
  { code: "412150", name: "プラス糀 糀甘酒LL ゆず", perCase: 18, aliases: [] },
  { code: "412151", name: "プラス糀 糀甘酒LL 豆乳", perCase: 18, aliases: [] },
  { code: "412154", name: "プラス糀 糀甘酒LL 生姜", perCase: 18, aliases: [] },
  { code: "412165", name: "プラス糀 糀甘酒の素", perCase: 12, aliases: [] },
  { code: "412169", name: "プラス糀 糀甘酒LL 抹茶", perCase: 18, aliases: [] },
  { code: "412171", name: "プラス糀 糀甘酒LL 糀リッチ粒", perCase: 6, aliases: [] },
  { code: "412174", name: "プラス糀 糀甘酒LL 乳酸菌", perCase: 12, aliases: [] },
  { code: "412182", name: "プラス糀 糀甘酒LL オリゴ糖", perCase: 18, aliases: [] },
  { code: "412184", name: "プラス糀 糀甘酒LL 沖縄の塩", perCase: 18, aliases: [] },
  { code: "412185", name: "プラス糀 生しょうゆ糀", perCase: 32, aliases: [] },
  { code: "412190", name: "プラス糀 米糀ミルク", perCase: 24, aliases: [] },
  { code: "412207", name: "プラス糀 糀甘酒LL 馬路村ゆず果汁 1.5倍", perCase: 18, aliases: [] },
  { code: "412208", name: "プラス糀 糀甘酒LL 糖質30%オフ", perCase: 12, aliases: [] },
  { code: "412209", name: "プラス糀 糀甘酒LL 粒リッチ粒", perCase: 12, aliases: [] },
  { code: "412294", name: "プラス糀 生塩糀", perCase: 32, aliases: [] },
  { code: "412304", name: "プラス糀 玉ねぎ生塩糀", perCase: 32, aliases: [] },
  { code: "412305", name: "プラス糀 にんにくしょうが生塩糀", perCase: 32, aliases: [] },
  {
    code: "412310",
    name: "プラス糀 生塩糀パウダーボトル",
    perCase: 24,
    aliases: ["プラス糀 生塩糀パウダー ボトル"]
  },
  { code: "412363", name: "辛みそ", perCase: 60, aliases: [] },
  { code: "412410", name: "賛否両論 糀 ドレッシング", perCase: 8, aliases: [] },
  { code: "412727", name: "ダイズラボ ダイズ粉のカレールー", perCase: 40, aliases: [] },
  { code: "413534", name: "液みそ 糀美人", perCase: 10, aliases: [] },
  { code: "413535", name: "液みそ とん汁専用", perCase: 10, aliases: [] },
  { code: "422021", name: "タニタ食堂の減塩生みそ", perCase: 8, aliases: [] },
  { code: "429577", name: "カップ 料亭の味 あおさ", perCase: 60, aliases: [] },
  { code: "671332", name: "FD タニタ食堂監修 あおさ", perCase: 80, aliases: [] },
  { code: "671333", name: "FD タニタ食堂監修 オクラとめかぶ", perCase: 80, aliases: [] },
  { code: "764860", name: "業務用 プラス糀 米糀粉末", perCase: 10, aliases: [] }
];

/**
 * 現在有効なマスタを返す
 * localStorage にカスタムマスタがあればそちらを優先する
 */
export function getActiveMaster() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (_) { /* 読み込み失敗時は初期マスタを使用 */ }
  return INITIAL_MASTER;
}

/**
 * カスタムマスタを localStorage に保存する
 * @param {Array} master
 */
export function saveCustomMaster(master) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(master));
}

/**
 * カスタムマスタを削除して初期マスタに戻す
 */
export function resetToInitialMaster() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * 現在カスタムマスタが有効かどうか
 */
export function isCustomMasterActive() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) && parsed.length > 0;
    }
  } catch (_) {}
  return false;
}

// 後方互換のため PRODUCT_MASTER も export（checker.js等から参照）
export const PRODUCT_MASTER = getActiveMaster();

/**
 * 類似名称の注意組み合わせ（コードが近い・名前が似ている）
 */
export const SIMILAR_PRODUCT_PAIRS = [
  {
    codes: ["412171", "412209"],
    names: [
      "プラス糀 糀甘酒LL 糀リッチ粒",
      "プラス糀 糀甘酒LL 粒リッチ粒"
    ],
    warning: "類似名称の商品が存在するため、商品コードの再確認を推奨します"
  }
];

/**
 * コードで商品を検索（常に最新のアクティブマスタを参照）
 */
export function findByCode(code) {
  const normalized = String(code).trim();
  return getActiveMaster().find(p => p.code === normalized) || null;
}

/**
 * 正規化済み名前でマスタを検索（完全一致 or エイリアス一致）
 */
export function findByNormalizedName(normalizedName) {
  return getActiveMaster().find(p => {
    if (normalizeName(p.name) === normalizedName) return true;
    return (p.aliases || []).some(a => normalizeName(a) === normalizedName);
  }) || null;
}

/**
 * 商品名の正規化
 * - 全角カッコ→半角
 * - 全角コロン→半角
 * - 全角スペース→半角
 * - 連続空白→1つ
 * - 前後トリム
 */
export function normalizeName(name) {
  return name
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/：/g, ':')
    .replace(/　/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * 類似名称チェック：入力コードと名称が"似ている別商品"に該当するか
 * @returns {object|null} 該当する注意情報、またはnull
 */
export function checkSimilarNameWarning(inputCode, inputName) {
  const normalizedInput = normalizeName(inputName);
  for (const pair of SIMILAR_PRODUCT_PAIRS) {
    if (pair.codes.includes(inputCode)) {
      // このコードがペアに含まれている
      // → 入力名がペアの相手の名前に近い場合に警告
      const partnerIndex = pair.codes.indexOf(inputCode) === 0 ? 1 : 0;
      const partnerName = pair.names[partnerIndex];
      const partnerNorm = normalizeName(partnerName);
      // 類似度チェック（簡易：どちらかの名前が部分的に含まれる）
      if (
        partnerNorm.includes(normalizedInput.slice(0, 6)) ||
        normalizedInput.includes(partnerNorm.slice(0, 6))
      ) {
        return {
          warning: pair.warning,
          partnerName,
          partnerCode: pair.codes[partnerIndex]
        };
      }
    }
    // コードが不明な状態で名称だけが入力されている場合
    const matchedIndex = pair.names.findIndex(n => {
      const norm = normalizeName(n);
      return norm === normalizedInput || 
             levenshteinSimilarity(norm, normalizedInput) > 0.8;
    });
    if (matchedIndex !== -1) {
      return {
        warning: pair.warning,
        matchedName: pair.names[matchedIndex],
        matchedCode: pair.codes[matchedIndex],
        partnerName: pair.names[matchedIndex === 0 ? 1 : 0],
        partnerCode: pair.codes[matchedIndex === 0 ? 1 : 0]
      };
    }
  }
  return null;
}

/**
 * 簡易レーベンシュタイン類似度（0〜1）
 */
export function levenshteinSimilarity(a, b) {
  if (a === b) return 1;
  const la = a.length, lb = b.length;
  if (la === 0 || lb === 0) return 0;
  const dp = Array.from({ length: la + 1 }, (_, i) => 
    Array.from({ length: lb + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  );
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return 1 - dp[la][lb] / Math.max(la, lb);
}
