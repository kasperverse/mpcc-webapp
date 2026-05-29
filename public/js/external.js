/**
 * MPCC - 外部参照モジュール
 * 未知商品のマルコメ業務用商品ページ参照処理
 *
 * ※ CORSの制限によりブラウザから直接スクレイピングはできないため、
 *    以下の方針で実装：
 *    1. 既知の詳細URLリストから商品コード・名称で照合（内蔵キャッシュ）
 *    2. 照合できない場合はマルコメ業務用商品ページへのリンクを表示
 *    3. CORSプロキシが利用可能な場合はページ取得を試みる（将来拡張）
 */

/**
 * 内蔵された参照済み商品情報（確認済みのものをキャッシュとして保持）
 * 実際の業務では定期更新することを想定
 */
const KNOWN_EXTERNAL_PRODUCTS = [
  {
    code: "412295",
    name: "プラス糀 生塩糀",
    spec: "500g×20",
    perCase: 20,
    url: "https://www.marukome.co.jp/business/product/detail/koji_001b/",
    note: "業務用 500g×20入り"
  },
  {
    code: "412796",
    name: "業務用 糀みつ 1L×12本",
    spec: "1L×12本",
    perCase: 12,
    url: "https://www.marukome.co.jp/business/product/detail/koji_016b/",
    note: "業務用 1L×12本入り"
  },
  {
    code: "252600",
    name: "プロ用白",
    spec: "1kg×10",
    perCase: 10,
    url: "https://www.marukome.co.jp/business/product/detail/miso_041b/",
    note: "業務用 1kg×10入り"
  },
  {
    code: "431322",
    name: "業務用生みそ汁 あさり 100食",
    spec: "100食×6",
    perCase: 6,
    url: "https://www.marukome.co.jp/business/product/detail/instant_013b/",
    note: "業務用 100食×6ケース"
  }
];

/**
 * 規格×入数から1ケースあたり個数を抽出
 * 例: "500g×20" → 20, "1L×12本" → 12, "100食×6" → 6
 * @param {string} spec - 規格×入数文字列
 * @returns {number|null} 個数、または null
 */
export function extractPerCaseFromSpec(spec) {
  if (!spec) return null;
  // 「×」または「x」の後の数字を取得
  const match = spec.match(/[×x×]\s*(\d+)/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

/**
 * 内蔵キャッシュから商品を検索
 * @param {string} code - 商品コード
 * @param {string} name - 商品名
 * @returns {object|null} キャッシュ結果
 */
function searchInternalCache(code, name) {
  if (code) {
    const byCode = KNOWN_EXTERNAL_PRODUCTS.find(p => p.code === String(code).trim());
    if (byCode) return byCode;
  }
  if (name) {
    const normalizedInput = name.toLowerCase().replace(/\s+/g, '');
    const byName = KNOWN_EXTERNAL_PRODUCTS.find(p => {
      const normalizedP = p.name.toLowerCase().replace(/\s+/g, '');
      return normalizedP.includes(normalizedInput) || normalizedInput.includes(normalizedP.slice(0, 6));
    });
    if (byName) return byName;
  }
  return null;
}

/**
 * CORS プロキシ経由でマルコメ業務用商品ページを取得（試み）
 * ※ 現在は allorigins.win 等を利用する形だが、
 *   本番環境では Cloudflare Worker を経由することを推奨
 * @param {string} code - 商品コード
 * @param {string} name - 商品名
 * @returns {Promise<object|null>}
 */
async function fetchFromMarukome(code, name) {
  // マルコメ商品ページのURLを構築
  // 注意: CORSの制限があるため、実際のブラウザからの直接取得は制限される
  // allorigins.win や corsproxy.io などの無料CORSプロキシを試みる
  const searchQuery = code || name;
  if (!searchQuery) return null;

  // 商品一覧ページのHTML取得を試みる（CORSプロキシ経由）
  const targetUrl = `https://www.marukome.co.jp/business/product/`;
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;

  try {
    const response = await fetch(proxyUrl, {
      signal: AbortSignal.timeout(8000) // 8秒でタイムアウト
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (!data.contents) return null;

    // HTMLを解析して商品リストを抽出
    const parser = new DOMParser();
    const doc = parser.parseFromString(data.contents, 'text/html');

    // 商品リンクを探す
    const productLinks = Array.from(doc.querySelectorAll('a[href*="/business/product/detail/"]'));

    for (const link of productLinks) {
      const linkText = link.textContent.trim();
      const href = link.getAttribute('href');

      // コードまたは名称でマッチング
      const normalizedLinkText = linkText.toLowerCase().replace(/\s+/g, '');
      const normalizedName = (name || '').toLowerCase().replace(/\s+/g, '');

      const codeInText = linkText.match(/\d{5,7}/);
      const codeMatch = code && codeInText && codeInText[0] === String(code);
      const nameMatch = normalizedName && normalizedLinkText.includes(normalizedName.slice(0, 5));

      if (codeMatch || nameMatch) {
        return {
          code: codeInText ? codeInText[0] : code,
          name: linkText,
          url: href.startsWith('http') ? href : `https://www.marukome.co.jp${href}`,
          spec: null,
          perCase: null,
          fromWeb: true
        };
      }
    }

    return null;
  } catch (e) {
    // ネットワークエラーやタイムアウト
    return null;
  }
}

/**
 * 商品詳細ページから規格情報を取得
 * @param {string} url - 商品詳細URL
 * @returns {Promise<{spec: string, perCase: number}|null>}
 */
async function fetchProductDetail(url) {
  if (!url) return null;

  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;

  try {
    const response = await fetch(proxyUrl, {
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return null;

    const data = await response.json();
    if (!data.contents) return null;

    const parser = new DOMParser();
    const doc = parser.parseFromString(data.contents, 'text/html');

    // 商品名の取得
    const nameEl = doc.querySelector('h1, .product-name, [class*="name"]');
    const productName = nameEl ? nameEl.textContent.trim() : null;

    // マルコメコードを探す
    let marukomeCode = null;
    const allText = doc.body ? doc.body.textContent : '';
    const codeMatch = allText.match(/マルコメコード[：:\s]*(\d{5,7})/);
    if (codeMatch) marukomeCode = codeMatch[1];

    // 規格×入数を探す
    let specText = null;
    const specMatch = allText.match(/規格[××]?入数[：:\s]*([^\n\r]{2,30})/);
    if (specMatch) {
      specText = specMatch[1].trim().replace(/\s+/g, '');
    } else {
      // 一般的なパターン: 数字×数字 or 数字L×数字本 etc
      const specPatterns = allText.match(/(\d+(?:\.\d+)?(?:g|kg|ml|L|食|個)?×\d+(?:本|個|食|袋|枚)?)/g);
      if (specPatterns && specPatterns.length > 0) {
        specText = specPatterns[0];
      }
    }

    const perCase = specText ? extractPerCaseFromSpec(specText) : null;

    return {
      name: productName,
      code: marukomeCode,
      spec: specText,
      perCase,
      url
    };
  } catch (e) {
    return null;
  }
}

/**
 * 未知商品の外部参照を実行
 * @param {string} code - 商品コード
 * @param {string} name - 商品名
 * @returns {Promise<object>} 外部参照結果
 */
export async function lookupExternalProduct(code, name) {
  // ステップ1: 内蔵キャッシュを確認
  const cached = searchInternalCache(code, name);
  if (cached) {
    const perCase = cached.perCase || extractPerCaseFromSpec(cached.spec);
    return {
      found: true,
      source: 'cache',
      code: cached.code,
      name: cached.name,
      spec: cached.spec,
      perCase,
      url: cached.url,
      note: cached.note,
      message: `マルコメサイトで候補商品を確認しました（参照済みキャッシュ）`,
      perCaseMessage: perCase
        ? `参考：1ケースあたり${perCase}${extractUnitFromSpec(cached.spec)}の可能性があります`
        : null,
      disclaimer: '参考情報のため、最終確認を推奨します'
    };
  }

  // ステップ2: CORSプロキシ経由でマルコメサイトを検索
  const webResult = await fetchFromMarukome(code, name);
  if (webResult) {
    // 詳細ページからさらに情報を取得
    const detail = webResult.url ? await fetchProductDetail(webResult.url) : null;
    const spec = detail?.spec || webResult.spec;
    const perCase = detail?.perCase || (spec ? extractPerCaseFromSpec(spec) : null);
    const resolvedCode = detail?.code || webResult.code || code;
    const resolvedName = detail?.name || webResult.name || name;

    return {
      found: true,
      source: 'web',
      code: resolvedCode,
      name: resolvedName,
      spec,
      perCase,
      url: webResult.url,
      message: `マルコメサイトで候補商品を確認しました`,
      perCaseMessage: perCase
        ? `参考：1ケースあたり${perCase}${spec ? extractUnitFromSpec(spec) : '個'}の可能性があります`
        : null,
      disclaimer: '参考情報のため、最終確認を推奨します'
    };
  }

  // 見つからなかった場合
  return {
    found: false,
    source: 'none',
    message: 'マルコメ業務用商品ページでも確認できませんでした',
    searchUrl: `https://www.marukome.co.jp/business/product/`,
    disclaimer: `https://www.marukome.co.jp/business/product/ にてご確認ください`
  };
}

/**
 * 規格文字列から単位を抽出
 * 例: "1L×12本" → "本", "500g×20" → "個", "100食×6" → "ケース"
 */
function extractUnitFromSpec(spec) {
  if (!spec) return '個';
  const match = spec.match(/[×x]\s*\d+\s*(本|個|食|袋|枚|缶)/i);
  return match ? match[1] : '個';
}
