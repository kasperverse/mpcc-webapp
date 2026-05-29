/**
 * MPCC - アプリケーションメインコントローラー
 * 入力ページ ↔ 結果ページの状態管理と画面制御
 */

import { parseMultiLine } from './parser.js';
import { checkAll, calcSummary, STATUS } from './checker.js';
import { lookupExternalProduct } from './external.js';
import { isCustomMasterActive, getActiveMaster } from './master.js';
import {
  parseCsvToMaster,
  masterToCsv,
  applyCustomMaster,
  applyInitialMaster,
  getInitialMasterAsCsv
} from './master-editor.js';

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
// マスタ管理モーダル関連
let masterEditBtn, masterModal, masterModalClose, masterCancelBtn;
let masterApplyBtn, masterResetBtn;
let masterCsvTextarea, masterFileInput, fileDropZone;
let masterFileTextarea, fileReadResult, fileReadInfo;
let currentMasterTextarea, masterValidationResult;
let masterStatusBadge, modalMasterStatus;
let copyCurrentMasterBtn, downloadCurrentMasterBtn;
// 現在モーダルに読み込まれているCSVテキスト（貼り付けorファイル）
let _pendingCsvText = '';
let _activeTab = 'paste';

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

  // マスタ管理モーダル関連
  masterEditBtn           = $('master-edit-btn');
  masterModal             = $('master-modal');
  masterModalClose        = $('master-modal-close');
  masterCancelBtn         = $('master-cancel-btn');
  masterApplyBtn          = $('master-apply-btn');
  masterResetBtn          = $('master-reset-btn');
  masterCsvTextarea       = $('master-csv-textarea');
  masterFileInput         = $('master-file-input');
  fileDropZone            = $('file-drop-zone');
  masterFileTextarea      = $('master-file-textarea');
  fileReadResult          = $('file-read-result');
  fileReadInfo            = $('file-read-info');
  currentMasterTextarea   = $('current-master-textarea');
  masterValidationResult  = $('master-validation-result');
  masterStatusBadge       = $('master-status-badge');
  modalMasterStatus       = $('modal-master-status');
  copyCurrentMasterBtn    = $('copy-current-master-btn');
  downloadCurrentMasterBtn= $('download-current-master-btn');

  initMasterModal();

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
  updateMasterStatusBadge();
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

// ============================================================
// マスタ管理モーダル
// ============================================================

function initMasterModal() {
  // 開くボタン
  masterEditBtn.addEventListener('click', openMasterModal);

  // 閉じる系
  masterModalClose.addEventListener('click', closeMasterModal);
  masterCancelBtn.addEventListener('click', closeMasterModal);
  masterModal.addEventListener('click', e => {
    if (e.target === masterModal) closeMasterModal();
  });

  // Escape キーで閉じる
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && masterModal.style.display !== 'none') {
      closeMasterModal();
    }
  });

  // タブ切り替え
  document.querySelectorAll('.modal-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.id.replace('tab-', '')));
  });

  // 貼り付けテキストエリア入力 → リアルタイムバリデーション
  masterCsvTextarea.addEventListener('input', () => {
    _pendingCsvText = masterCsvTextarea.value;
    validateAndPreview(_pendingCsvText);
  });

  // ファイルドロップゾーン
  fileDropZone.addEventListener('click', () => masterFileInput.click());
  fileDropZone.addEventListener('dragover', e => {
    e.preventDefault();
    fileDropZone.classList.add('drag-over');
  });
  fileDropZone.addEventListener('dragleave', () => {
    fileDropZone.classList.remove('drag-over');
  });
  fileDropZone.addEventListener('drop', e => {
    e.preventDefault();
    fileDropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  });
  masterFileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) readFile(file);
  });

  // 適用ボタン
  masterApplyBtn.addEventListener('click', handleMasterApply);

  // リセットボタン
  masterResetBtn.addEventListener('click', handleMasterReset);

  // コピーボタン
  copyCurrentMasterBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(currentMasterTextarea.value)
      .then(() => {
        copyCurrentMasterBtn.textContent = '✓ コピーしました';
        setTimeout(() => { copyCurrentMasterBtn.textContent = '📋 CSVをコピー'; }, 2000);
      })
      .catch(() => {
        currentMasterTextarea.select();
        document.execCommand('copy');
      });
  });

  // ダウンロードボタン
  downloadCurrentMasterBtn.addEventListener('click', () => {
    const csv = currentMasterTextarea.value;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = isCustomMasterActive() ? 'mpcc_custom_master.csv' : 'mpcc_initial_master.csv';
    a.click();
    URL.revokeObjectURL(url);
  });
}

/** モーダルを開く */
function openMasterModal() {
  _pendingCsvText = '';
  _activeTab = 'paste';

  // 状態表示を更新
  updateModalMasterStatus();

  // テキストエリアをクリア
  masterCsvTextarea.value = '';
  if (masterFileTextarea) masterFileTextarea.value = '';
  if (fileReadResult)     fileReadResult.style.display = 'none';
  masterValidationResult.style.display = 'none';
  masterApplyBtn.disabled = true;

  // 「現在のマスタ確認」タブの内容を更新
  currentMasterTextarea.value = masterToCsv(getActiveMaster());

  // タブを貼り付けに戻す
  switchTab('paste');

  masterModal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  setTimeout(() => masterCsvTextarea.focus(), 100);
}

/** モーダルを閉じる */
function closeMasterModal() {
  masterModal.style.display = 'none';
  document.body.style.overflow = '';
  masterFileInput.value = '';
}

/** タブ切り替え */
function switchTab(tabName) {
  _activeTab = tabName;
  document.querySelectorAll('.modal-tab').forEach(t => {
    const isActive = t.id === `tab-${tabName}`;
    t.classList.toggle('active', isActive);
    t.setAttribute('aria-selected', isActive);
  });
  document.querySelectorAll('.modal-panel').forEach(p => {
    p.classList.toggle('active', p.id === `panel-${tabName}`);
  });

  // 現在のマスタタブを開いたとき内容を最新化
  if (tabName === 'current') {
    currentMasterTextarea.value = masterToCsv(getActiveMaster());
    masterValidationResult.style.display = 'none';
    masterApplyBtn.disabled = true;
  }
  // 貼り付けタブに戻ったときは既入力があればバリデーション維持
  if (tabName === 'paste' && masterCsvTextarea.value.trim()) {
    validateAndPreview(masterCsvTextarea.value);
  }
}

/** ファイル読み込み */
function readFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result;
    masterFileTextarea.value = text;
    fileReadInfo.innerHTML = `✓ 読み込み完了：<strong>${escapeHtml(file.name)}</strong>（${text.split('\n').filter(l=>l.trim()).length} 行）`;
    fileReadResult.style.display = 'block';
    _pendingCsvText = text;
    validateAndPreview(text);
  };
  reader.onerror = () => {
    fileReadInfo.innerHTML = `<span style="color:var(--color-error);">✗ ファイルの読み込みに失敗しました</span>`;
    fileReadResult.style.display = 'block';
  };
  reader.readAsText(file, 'UTF-8');
}

/** バリデーション実行＋プレビュー表示 */
function validateAndPreview(csvText) {
  masterValidationResult.style.display = 'block';

  if (!csvText.trim()) {
    masterValidationResult.innerHTML = '';
    masterValidationResult.style.display = 'none';
    masterApplyBtn.disabled = true;
    return;
  }

  const { data, errors, warnings } = parseCsvToMaster(csvText);
  const hasError = errors.length > 0;
  const hasWarn  = warnings.length > 0;

  let boxClass = 'validation-box--ok';
  let title = `✓ ${data.length} 件のデータを確認しました。問題なし。`;
  if (hasError) {
    boxClass = 'validation-box--error';
    title = `✗ エラーがあります（${errors.length} 件）。修正してから適用してください。`;
  } else if (hasWarn) {
    boxClass = 'validation-box--warn';
    title = `△ ${data.length} 件を確認しました。注意事項があります。`;
  }

  let html = `<div class="validation-box ${boxClass}">
    <div class="validation-box__title">${escapeHtml(title)}</div>`;

  if (errors.length > 0) {
    html += `<ul>${errors.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`;
  }
  if (warnings.length > 0) {
    html += `<ul>${warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`;
  }

  if (!hasError && data.length > 0) {
    // プレビュー（先頭3件）
    html += `<div style="margin-top:8px; font-size:12px; opacity:0.8;">
      先頭 ${Math.min(3, data.length)} 件のプレビュー：<br>
      <code>${data.slice(0, 3).map(p =>
        `${escapeHtml(p.code)} / ${escapeHtml(p.name)} / ${p.perCase}個/ケース`
      ).join('<br>')}</code>
    </div>`;
  }

  html += `</div>`;
  masterValidationResult.innerHTML = html;

  // エラーなし＆1件以上あれば適用ボタンを有効化
  masterApplyBtn.disabled = hasError || data.length === 0;
}

/** マスタを適用する */
function handleMasterApply() {
  const csvText = _pendingCsvText || masterCsvTextarea.value;
  if (!csvText.trim()) return;

  const { data, errors } = parseCsvToMaster(csvText);
  if (errors.length > 0 || data.length === 0) return;

  if (!confirm(`${data.length} 件の商品データでマスタを上書きします。よろしいですか？\n\n※ 現在のマスタは置き換えられます。`)) return;

  applyCustomMaster(data);
  closeMasterModal();
  updateMasterStatusBadge();

  // 成功通知
  showToast(`✓ マスタを ${data.length} 件で更新しました`, 'ok');
}

/** 初期マスタに戻す */
function handleMasterReset() {
  const isCustom = isCustomMasterActive();
  const msg = isCustom
    ? `カスタムマスタを削除して初期マスタ（30件）に戻します。よろしいですか？`
    : `現在すでに初期マスタ（30件）が使用されています。`;

  if (!isCustom) { alert(msg); return; }
  if (!confirm(msg)) return;

  applyInitialMaster();
  closeMasterModal();
  updateMasterStatusBadge();
  showToast('✓ 初期マスタ（30件）に戻しました', 'ok');
}

/** マスタ状態バッジを更新（入力ページのボタン下） */
function updateMasterStatusBadge() {
  if (!masterStatusBadge || !masterEditBtn) return;
  const isCustom = isCustomMasterActive();
  const count = getActiveMaster().length;

  if (isCustom) {
    masterStatusBadge.style.display = 'block';
    masterStatusBadge.innerHTML = `
      <span class="master-badge master-badge--custom">
        ⚠ カスタムマスタ使用中（${count} 件）
      </span>`;
    masterEditBtn.classList.add('is-custom');
  } else {
    masterStatusBadge.style.display = 'none';
    masterEditBtn.classList.remove('is-custom');
  }
}

/** モーダル内のマスタ状態表示を更新 */
function updateModalMasterStatus() {
  if (!modalMasterStatus) return;
  const isCustom = isCustomMasterActive();
  const count = getActiveMaster().length;

  if (isCustom) {
    modalMasterStatus.innerHTML = `
      <span class="master-badge master-badge--custom">
        ⚠ カスタムマスタ使用中（${count} 件）
      </span>
      <span style="font-size:12px; color:var(--color-text-muted); margin-left:8px;">
        「初期マスタに戻す」で初期30件に戻せます
      </span>`;
  } else {
    modalMasterStatus.innerHTML = `
      <span class="master-badge master-badge--default">
        ✓ 初期マスタ使用中（${count} 件）
      </span>
      <span style="font-size:12px; color:var(--color-text-muted); margin-left:8px;">
        CSVを貼り付けるか、ファイルを読み込んで上書きできます
      </span>`;
  }
}

/** トースト通知 */
function showToast(message, type = 'ok') {
  const existing = document.querySelector('.toast-notification');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  const colorMap = { ok: 'var(--color-ok)', error: 'var(--color-error)', warning: 'var(--color-warning)' };
  toast.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; z-index: 9999;
    background: ${colorMap[type] || colorMap.ok}; color: #fff;
    padding: 12px 20px; border-radius: 8px; font-size: 14px; font-weight: 700;
    box-shadow: 0 4px 16px rgba(0,0,0,0.2);
    animation: slideUp 0.2s ease;
    max-width: 320px;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
