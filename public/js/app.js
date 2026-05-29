/**
 * MPCC - アプリケーションメインコントローラー
 * 入力ページ ↔ 結果ページの状態管理と画面制御
 */

import { parseMultiLine } from './parser.js';
import { checkAll, calcSummary, STATUS } from './checker.js';
import { lookupExternalProduct } from './external.js';

// ============================================================
// サンプルデータ
// ============================================================
const SAMPLES = {
  all: `プラス糀 生塩糀(412294)：2ケース：64
プラス糀 糀甘酒LL オリゴ糖(412182)：3ケース：54
FD タニタ食堂監修 オクラとめかぶ(671333)：1ケース：80
プラス糀 生塩糀パウダー ボトル(412310)：1ケース：24
プラス糀 生塩糀(412294)：2ケース：60
プラス糀 糀甘酒LL 乳酸菌(412174)：3ケース：40
プラス糀 糀甘酒LL 粒リッチ粒(412171)：2ケース：12
業務用 糀みつ 1L×12本(412796)：1ケース：12
プロ用白(252600)：1ケース：10`,
  normal: `プラス糀 生塩糀(412294)：2ケース：64
プラス糀 糀甘酒LL オリゴ糖(412182)：3ケース：54
FD タニタ食堂監修 オクラとめかぶ(671333)：1ケース：80`,
  variant: `プラス糀 生塩糀パウダー ボトル(412310)：1ケース：24`,
  mismatch: `プラス糀 生塩糀(412294)：2ケース：60
プラス糀 糀甘酒LL 乳酸菌(412174)：3ケース：40`,
  similar: `プラス糀 糀甘酒LL 粒リッチ粒(412171)：2ケース：12`,
  unknown: `業務用 糀みつ 1L×12本(412796)：1ケース：12
プロ用白(252600)：1ケース：10`
};

// ============================================================
// DOM参照
// ============================================================
const $ = id => document.getElementById(id);

let inputPage, resultPage;
let textarea, checkBtn, sampleAllBtn;
let resultList, summaryEl;
let loadingOverlay;
let backBtn;

// ============================================================
// 初期化
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  inputPage = $('page-input');
  resultPage = $('page-result');
  textarea = $('input-textarea');
  checkBtn = $('check-btn');
  sampleAllBtn = $('sample-all-btn');
  resultList = $('result-list');
  summaryEl = $('summary-section');
  loadingOverlay = $('loading-overlay');
  backBtn = $('back-btn');

  // URLハッシュで初期状態を判断
  if (window.location.hash === '#result') {
    // 保存された結果があれば復元（将来拡張）
  }

  // イベントリスナー登録
  checkBtn.addEventListener('click', handleCheck);
  backBtn.addEventListener('click', handleBack);

  // サンプル入力ボタン
  sampleAllBtn.addEventListener('click', () => {
    textarea.value = SAMPLES.all;
    textarea.focus();
  });

  document.querySelectorAll('[data-sample]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.sample;
      if (SAMPLES[key]) {
        const current = textarea.value.trim();
        textarea.value = current ? current + '\n' + SAMPLES[key] : SAMPLES[key];
        textarea.focus();
      }
    });
  });

  // テキストエリアの行数表示
  textarea.addEventListener('input', updateLineCount);

  // キーボードショートカット: Ctrl+Enter でチェック
  textarea.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleCheck();
    }
  });

  showPage('input');
});

// ============================================================
// ページ切り替え
// ============================================================
function showPage(page) {
  inputPage.classList.remove('active');
  resultPage.classList.remove('active');
  if (page === 'input') {
    inputPage.classList.add('active');
    window.location.hash = '';
  } else {
    resultPage.classList.add('active');
    window.location.hash = 'result';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// ============================================================
// 行数更新
// ============================================================
function updateLineCount() {
  const lines = textarea.value.split('\n').filter(l => l.trim()).length;
  const countEl = $('line-count');
  if (countEl) {
    countEl.textContent = lines > 0 ? `${lines}行入力中` : '';
  }
}

// ============================================================
// チェック実行
// ============================================================
async function handleCheck() {
  const input = textarea.value.trim();
  if (!input) {
    textarea.focus();
    showInputError('入力内容が空です。1行以上入力してください。');
    return;
  }

  clearInputError();
  showLoading(true);

  try {
    // パース
    const parsed = parseMultiLine(input);

    if (parsed.length === 0) {
      showLoading(false);
      showInputError('有効な行が見つかりませんでした。入力フォーマットを確認してください。');
      return;
    }

    // 同期判定
    const results = checkAll(parsed);

    // 結果画面を表示
    renderResultPage(results);
    showPage('result');

    // 未知商品の非同期外部参照
    await resolveUnknownProducts(results);

  } catch (err) {
    console.error('チェック処理エラー:', err);
    showInputError('処理中にエラーが発生しました。入力内容を確認してください。');
  } finally {
    showLoading(false);
  }
}

// ============================================================
// 戻るボタン
// ============================================================
function handleBack() {
  showPage('input');
}

// ============================================================
// ローディング表示
// ============================================================
function showLoading(show) {
  if (loadingOverlay) {
    loadingOverlay.classList.toggle('active', show);
  }
  if (checkBtn) {
    checkBtn.disabled = show;
  }
}

// ============================================================
// 入力エラー表示
// ============================================================
function showInputError(msg) {
  const el = $('input-error');
  if (el) {
    el.textContent = msg;
    el.style.display = 'block';
  }
}

function clearInputError() {
  const el = $('input-error');
  if (el) {
    el.style.display = 'none';
    el.textContent = '';
  }
}

// ============================================================
// 結果ページレンダリング
// ============================================================
function renderResultPage(results) {
  renderSummary(results);
  renderResultList(results);
}

/**
 * サマリーカードレンダリング
 */
function renderSummary(results) {
  const s = calcSummary(results);
  if (!summaryEl) return;

  summaryEl.innerHTML = `
    <div class="summary-grid">
      <div class="summary-card summary-card--total">
        <div class="summary-card__number">${s.total}</div>
        <div class="summary-card__label">入力件数</div>
      </div>
      <div class="summary-card summary-card--ok">
        <div class="summary-card__number">${s.ok}</div>
        <div class="summary-card__label">問題なし</div>
      </div>
      <div class="summary-card summary-card--warning">
        <div class="summary-card__number">${s.warning}</div>
        <div class="summary-card__label">注意あり</div>
      </div>
      <div class="summary-card summary-card--error">
        <div class="summary-card__number">${s.error}</div>
        <div class="summary-card__label">エラー</div>
      </div>
      <div class="summary-card summary-card--unknown">
        <div class="summary-card__number">${s.unknown}</div>
        <div class="summary-card__label">未知商品</div>
      </div>
      ${s.parseError > 0 ? `
      <div class="summary-card summary-card--parse-error">
        <div class="summary-card__number">${s.parseError}</div>
        <div class="summary-card__label">解析エラー</div>
      </div>` : ''}
    </div>
  `;
}

/**
 * 結果リストレンダリング
 */
function renderResultList(results) {
  if (!resultList) return;
  resultList.innerHTML = '';

  results.forEach((result, index) => {
    const card = createResultCard(result, index + 1);
    resultList.appendChild(card);
  });
}

/**
 * 結果カード生成
 */
function createResultCard(result, no) {
  const card = document.createElement('div');
  card.className = `result-card result-card--${result.status}`;
  card.dataset.resultNo = no;

  const statusIconMap = {
    [STATUS.OK]: '✓',
    [STATUS.WARNING]: '!',
    [STATUS.ERROR]: '✗',
    [STATUS.UNKNOWN]: '?',
    [STATUS.PARSE_ERROR]: '⚠'
  };

  const icon = statusIconMap[result.status] || '?';
  const isExpanded = result.status !== STATUS.OK;

  // ヘッダー部分
  const header = document.createElement('div');
  header.className = 'result-card__header';
  header.setAttribute('role', 'button');
  header.setAttribute('tabindex', '0');
  header.setAttribute('aria-expanded', isExpanded);
  header.innerHTML = `
    <span class="result-card__no">#${no}</span>
    <span class="status-icon status-icon--${result.status}" aria-hidden="true">${icon}</span>
    <span class="result-card__raw">${escapeHtml(result.raw)}</span>
    <span class="result-card__status-label">${escapeHtml(result.statusLabel)}</span>
    <span class="result-card__toggle ${isExpanded ? 'open' : ''}" aria-hidden="true">▼</span>
  `;

  // ボディ部分
  const body = document.createElement('div');
  body.className = `result-card__body ${isExpanded ? 'open' : ''}`;
  body.id = `card-body-${no}`;

  // 詳細グリッド
  const detailItems = buildDetailItems(result);
  const detailGrid = detailItems.map(item =>
    `<dt class="detail-grid__key">${escapeHtml(item.key)}</dt>
     <dd class="detail-grid__value">${item.value}</dd>`
  ).join('');

  // メッセージ一覧
  const messagesHtml = result.messages.map(msg => renderMessage(msg)).join('');

  body.innerHTML = `
    <dl class="detail-grid">${detailGrid}</dl>
    <div class="message-list">${messagesHtml}</div>
    ${result.isUnknown ? `<div class="external-result" id="external-${no}">
      <div class="external-result__title">外部参照結果</div>
      <div class="external-result__loading">
        <span class="spinner"></span>
        <span>マルコメ業務用商品ページを確認中...</span>
      </div>
    </div>` : ''}
  `;

  // アコーディオン開閉
  header.addEventListener('click', () => {
    const isOpen = body.classList.contains('open');
    body.classList.toggle('open', !isOpen);
    header.querySelector('.result-card__toggle').classList.toggle('open', !isOpen);
    header.setAttribute('aria-expanded', !isOpen);
  });

  header.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      header.click();
    }
  });

  card.appendChild(header);
  card.appendChild(body);

  return card;
}

/**
 * 詳細項目の構築
 */
function buildDetailItems(result) {
  const items = [];

  if (result.productName) {
    items.push({ key: '商品名', value: escapeHtml(result.productName) });
  }
  if (result.code) {
    items.push({ key: '商品コード', value: `<code>${escapeHtml(result.code)}</code>` });
  }
  if (result.cases !== null && result.cases !== undefined) {
    items.push({ key: '必要なケース数', value: `${result.cases} ケース` });
  }
  if (result.quantity !== null && result.quantity !== undefined) {
    items.push({ key: '必要な入り数', value: `${result.quantity} 個` });
  }
  if (result.masterProduct) {
    items.push({
      key: '1ケースあたり個数',
      value: `${result.masterProduct.perCase} 個 <span class="text-muted">（マスタ値）</span>`
    });
  }
  if (result.expectedQuantity !== null && result.expectedQuantity !== undefined) {
    const isMatch = result.quantity === result.expectedQuantity;
    const colorClass = isMatch ? 'text-ok' : 'text-error';
    items.push({
      key: '期待される入り数',
      value: `<span class="${colorClass}">${result.expectedQuantity} 個</span>`
    });
  }
  if (result.masterProduct?.name) {
    items.push({ key: 'マスタ商品名', value: escapeHtml(result.masterProduct.name) });
  }

  return items;
}

/**
 * メッセージアイテムのHTML生成
 */
function renderMessage(msg) {
  const type = msg.type === 'unknown' ? 'unknown' : msg.type;
  let mainHtml = escapeHtml(msg.text);

  // URLをリンクに変換
  mainHtml = mainHtml.replace(
    /(https?:\/\/[^\s<>'"]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  let detailHtml = '';
  if (msg.detail) {
    detailHtml = `<div class="message-item__detail">${escapeHtml(msg.detail)}</div>`;
  }

  return `
    <div class="message-item message-item--${type}">
      <div class="message-item__main">${mainHtml}</div>
      ${detailHtml}
    </div>
  `;
}

// ============================================================
// 未知商品の非同期外部参照
// ============================================================
async function resolveUnknownProducts(results) {
  const unknownResults = results
    .map((r, i) => ({ result: r, no: i + 1 }))
    .filter(({ result }) => result.isUnknown);

  if (unknownResults.length === 0) return;

  // 並列で参照（最大3件まで同時、それ以上は順次）
  const concurrency = 3;
  for (let i = 0; i < unknownResults.length; i += concurrency) {
    const batch = unknownResults.slice(i, i + concurrency);
    await Promise.all(batch.map(({ result, no }) =>
      resolveOnce(result, no)
    ));
  }
}

async function resolveOnce(result, no) {
  const externalEl = document.getElementById(`external-${no}`);
  if (!externalEl) return;

  try {
    const lookup = await lookupExternalProduct(result.code, result.productName);
    result.externalSearchResult = lookup;

    let html = `<div class="external-result__title">外部参照結果</div>`;

    if (lookup.found) {
      html += `
        <div class="message-item message-item--unknown" style="margin-bottom:8px;">
          <div class="message-item__main">${escapeHtml(lookup.message)}</div>
        </div>
      `;
      const infoRows = [];
      if (lookup.name) infoRows.push(['商品名', escapeHtml(lookup.name)]);
      if (lookup.code) infoRows.push(['マルコメコード', `<code>${escapeHtml(lookup.code)}</code>`]);
      if (lookup.spec) infoRows.push(['規格×入数', escapeHtml(lookup.spec)]);
      if (lookup.url) infoRows.push(['商品URL', `<a href="${escapeHtml(lookup.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(lookup.url)}</a>`]);

      if (infoRows.length > 0) {
        html += `<dl class="detail-grid" style="margin-bottom:10px;">`;
        infoRows.forEach(([k, v]) => {
          html += `<dt class="detail-grid__key">${escapeHtml(k)}</dt><dd class="detail-grid__value">${v}</dd>`;
        });
        html += `</dl>`;
      }

      if (lookup.perCaseMessage) {
        html += `
          <div class="message-item message-item--warning">
            <div class="message-item__main">${escapeHtml(lookup.perCaseMessage)}</div>
            ${lookup.disclaimer ? `<div class="message-item__detail">${escapeHtml(lookup.disclaimer)}</div>` : ''}
          </div>
        `;
      }

      // 入力値との照合
      if (lookup.perCase && result.cases && result.quantity) {
        const expected = result.cases * lookup.perCase;
        if (expected === result.quantity) {
          html += `
            <div class="message-item message-item--ok">
              <div class="message-item__main">参照データと入り数が一致しています（${result.cases}ケース × ${lookup.perCase} = ${expected}）</div>
            </div>
          `;
        } else {
          html += `
            <div class="message-item message-item--error">
              <div class="message-item__main">参照データと入り数が不一致の可能性があります</div>
              <div class="message-item__detail">参照データより: ${result.cases}ケース × ${lookup.perCase} = ${expected}が想定されます（入力値: ${result.quantity}）</div>
            </div>
          `;
        }
      }

    } else {
      html += `
        <div class="message-item message-item--unknown">
          <div class="message-item__main">${escapeHtml(lookup.message)}</div>
          ${lookup.disclaimer ? `<div class="message-item__detail">${escapeHtml(lookup.disclaimer)}</div>` : ''}
        </div>
      `;
    }

    externalEl.innerHTML = html;

  } catch (err) {
    console.warn(`外部参照エラー (no=${no}):`, err);
    externalEl.innerHTML = `
      <div class="external-result__title">外部参照結果</div>
      <div class="message-item message-item--unknown">
        <div class="message-item__main">外部参照中にエラーが発生しました</div>
        <div class="message-item__detail">
          <a href="https://www.marukome.co.jp/business/product/" target="_blank" rel="noopener noreferrer">
            マルコメ業務用商品ページ
          </a>にてご確認ください
        </div>
      </div>
    `;
  }
}

// ============================================================
// ユーティリティ
// ============================================================
function escapeHtml(str) {
  if (typeof str !== 'string') return str != null ? String(str) : '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
