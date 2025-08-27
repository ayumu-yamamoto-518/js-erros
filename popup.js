/**
 * popup.jsは、Chrome拡張機能のポップアップUIを制御し、エラー表示とコピー機能を提供する
 * 
 * 主な機能：
 * 1. エラー表示
 *    - URLパラメータからエラーデータを解析
 *    - エラー情報の視覚的表示（1件表示 + スクロール）
 *    - 「もっと見る」ボタンによる表示切り替え
 * 
 * 2. AIプロンプト生成
 *    - 設定からAIプロンプトテンプレートを取得
 *    - エラー情報をテンプレートに埋め込み
 *    - テキストエリアへの自動設定
 * 
 * 3. クリップボード機能
 *    - モダンブラウザでのnavigator.clipboard使用
 *    - 古いブラウザ対応のフォールバック機能
 *    - コピー完了の視覚的フィードバック
 * 
 * 4. 設定管理
 *    - chrome.storage.localからの設定取得
 *    - デフォルト値の提供
 * 
 */

/**
 * chrome.storage.localから設定値を取得する関数
 * 
 * 指定されたキーの設定値を取得し、存在しない場合はデフォルト値を返す
 * Promiseベースで非同期処理を行う
 * 
 * @param {string} key - 取得する設定のキー
 * @param {*} defaultValue - 設定が存在しない場合のデフォルト値
 * @returns {Promise<*>} 設定値またはデフォルト値
 * 
 */
function getStorageValue(key, defaultValue) {
	return new Promise((resolve) => {
		chrome.storage.local.get([key], function(result) {
			resolve(result[key] !== undefined ? result[key] : defaultValue);
		});
	});
}

/**
 * クリップボードにテキストをコピーする関数
 * 
 * モダンブラウザではnavigator.clipboard.writeTextを使用し、失敗した場合はフォールバック機能を使用する
 * コピー完了時には視覚的フィードバックを表示する
 * 
 * @param {string} text - コピーするテキスト
 * @returns {void}
 * 
 */
function copyToClipboard(text) {
	navigator.clipboard.writeText(text).then(function() {
		// コピー完了の視覚的フィードバック
		showCopyFeedback();
	}).catch(function(err) {
		console.error('コピーに失敗しました:', err);
		// エラーの場合はフォールバック
		fallbackCopyToClipboard(text);
	});
}

/**
 * コピー完了の視覚的フィードバックを表示する関数
 * 
 * コピーアイコンを一時的にチェックマークに変更し、2秒後に元の状態に戻す。ユーザーにコピー完了を明示する
 * 
 * @returns {void}
 * 
 */
function showCopyFeedback() {
	var copyIcon = document.getElementById('copyIcon');
	if(!copyIcon) return;
	
	// アイコンの元の状態を保存
	var originalSrc = copyIcon.src;
	var originalTitle = copyIcon.title;
	
	// アイコンを一時的に変更（チェックマーク）
	copyIcon.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTE2LjY2NjcgNC4xNjY2N0w3LjUgMTMuMzMzM0wzLjMzMzMzIDkuMTY2NjciIHN0cm9rZT0iIzAwN0NCQSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz4KPC9zdmc+';
	copyIcon.title = 'コピー完了！';
	
	// 2秒後に元に戻す
	setTimeout(function() {
		copyIcon.src = originalSrc;
		copyIcon.title = originalTitle;
		copyIcon.style.filter = '';
	}, 2000);
}

/**
 * フォールバック用のコピー機能（古いブラウザ対応）
 * 
 * navigator.clipboardが使用できない場合の代替手段
 * 一時的なtextarea要素を作成し、document.execCommandを使用してコピーを実行する
 * 
 * @param {string} text - コピーするテキスト
 * @returns {void}
 * 
 */
function fallbackCopyToClipboard(text) {
	var textArea = document.createElement('textarea');
	textArea.value = text;
	textArea.style.position = 'fixed';
	textArea.style.left = '-999999px';
	textArea.style.top = '-999999px';
	document.body.appendChild(textArea);
	textArea.focus();
	textArea.select();
	
	try {
		document.execCommand('copy');
		showCopyFeedback();
	} catch (err) {
		console.error('フォールバックコピーに失敗しました:', err);
	} finally {
		document.body.removeChild(textArea);
	}
}

/**
 * URLパラメータからエラーデータを解析する
 * 
 * ポップアップのURLパラメータからtabIdとエラー情報を取得し、グローバル変数に設定する
 * 
 * @type {URLSearchParams} URLパラメータの解析結果
 * @type {string|null} タブID
 * @type {string|null} エラー情報のJSON文字列
 * @type {Array<Object>} 解析されたエラー情報の配列
 */
var urlParams = new URLSearchParams(window.location.search);
var tabId = urlParams.get('tabId');
var errorsParam = urlParams.get('errors');
var errors = [];

// エラーデータの解析
if(errorsParam) {
	try {
		errors = JSON.parse(decodeURIComponent(errorsParam));
	} catch(e) {
		console.error('エラーデータの解析に失敗:', e);
	}
}

/**
 * エラーを表示する関数
 * 
 * エラー情報をHTMLとして生成し、指定されたコンテナに表示する
 * エラーが1件の場合はそのまま表示し、2件以上の場合は、最初の1件のみ表示して「もっと見る」ボタンを提供する
 * 
 * @returns {void}
 * 
 */
function displayErrors() {
	var container = document.getElementById('newErrorInfo');
	
	if(errors.length === 0) {
		container.innerHTML = '<div class="empty">エラーは発生していません</div>';
		return;
	}
	
	var html = '<div style="margin-bottom: 15px;"><strong>検出されたエラー (' + errors.length + '件):</strong></div>';
	
	// エラー表示エリア（スクロール可能）
	html += '<div class="errors-container">';
	
	errors.forEach(function(error, index) {
		html += '<div class="log">';
		html += '<div class="head">';
		html += '<span class="pill error">ERROR</span>';
		html += '<span class="src">' + (error.url || 'unknown') + (error.line ? ':' + error.line : '') + '</span>';
		html += '</div>';
		html += '<div class="msg">' + (error.text || 'Unknown error') + '</div>';
		html += '</div>';
	});
	
	html += '</div>';
	
	// エラーが2件以上ある場合は「もっと見る」ボタンを表示
	if(errors.length > 1) {
		html += '<div class="show-more-container">';
		html += '<button id="showMoreBtn" class="show-more-btn">もっと見る (' + (errors.length - 1) + '件)</button>';
		html += '</div>';
	}
	
	container.innerHTML = html;
	
	// 「もっと見る」ボタンの機能
	if(errors.length > 1) {
		var showMoreBtn = document.getElementById('showMoreBtn');
		var errorsContainer = container.querySelector('.errors-container');
		
		// 初期状態では最初の1件のみ表示
		var errorLogs = errorsContainer.querySelectorAll('.log');
		for(var i = 1; i < errorLogs.length; i++) {
			errorLogs[i].style.display = 'none';
		}
		
		showMoreBtn.onclick = function() {
			if(showMoreBtn.textContent.includes('もっと見る')) {
				// すべて表示
				for(var i = 0; i < errorLogs.length; i++) {
					errorLogs[i].style.display = 'block';
				}
				showMoreBtn.textContent = '折りたたむ';
			} else {
				// 最初の1件のみ表示
				for(var i = 0; i < errorLogs.length; i++) {
					errorLogs[i].style.display = i < 1 ? 'block' : 'none';
				}
				showMoreBtn.textContent = 'もっと見る (' + (errors.length - 1) + '件)';
			}
		};
	}
}

/**
 * AIプロンプトを生成する関数
 * 
 * 設定からAIプロンプトテンプレートを取得し、エラー情報を埋め込んで、完全なAIプロンプトを生成する
 * {error}プレースホルダーがエラー情報に置き換えられる
 * 
 * @returns {Promise<string>} 生成されたAIプロンプト
 * 
 */
async function generateAIPrompt() {
	var aiPromptTemplate = await getStorageValue('aiPromptTemplate', '以下のJavaScriptエラーを解析して修正方法を教えてください：\n\n{error}');
	
	var errorText = errors.map(function(error) {
		return 'エラー: ' + (error.text || 'Unknown error') + '\n場所: ' + (error.url || 'unknown') + (error.line ? ':' + error.line : '');
	}).join('\n\n');
	
	return aiPromptTemplate.replace('{error}', errorText);
}

/**
 * ページ読み込み時の初期化処理
 * 
 * DOMContentLoadedイベントで実行され、以下の処理を行う
 * 1. エラー情報の表示
 * 2. AIプロンプトの生成とテキストエリアへの設定
 * 3. コピーアイコンのイベントリスナー設定
 * 
 * @returns {Promise<void>} 初期化完了を示すPromise
 * 
 */
document.addEventListener('DOMContentLoaded', async function() {
	// エラーを表示
	displayErrors();
	
	// テキストエリアにAIプロンプトを設定
	var promptArea = document.getElementById('promptArea');
	if(promptArea && errors.length > 0) {
		var aiPrompt = await generateAIPrompt();
		promptArea.value = aiPrompt;
	}
	
	// コピーアイコンの機能
	var copyIcon = document.getElementById('copyIcon');
	if(copyIcon) {
		copyIcon.onclick = function() {
			copyToClipboard(promptArea.value);
		};
	}
});

