/**
 * JavaScript Errors Notifier - Popup Script
 * 
 * エラー表示とコピー機能を提供します。
 */

// 設定を取得する関数
function getStorageValue(key, defaultValue) {
	return new Promise((resolve) => {
		chrome.storage.local.get([key], function(result) {
			resolve(result[key] !== undefined ? result[key] : defaultValue);
		});
	});
}

// クリップボードにコピーする関数
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

// コピー完了の視覚的フィードバックを表示
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

// フォールバック用のコピー機能（古いブラウザ対応）
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

// エラーデータを解析
var urlParams = new URLSearchParams(window.location.search);
var tabId = urlParams.get('tabId');
var errorsParam = urlParams.get('errors');
var errors = [];

if(errorsParam) {
	try {
		errors = JSON.parse(decodeURIComponent(errorsParam));
	} catch(e) {
		console.error('エラーデータの解析に失敗:', e);
	}
}

// エラーを表示する関数
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

// AIプロンプトを生成する関数
async function generateAIPrompt() {
	var aiPromptTemplate = await getStorageValue('aiPromptTemplate', '以下のJavaScriptエラーを解析して修正方法を教えてください：\n\n{error}');
	
	var errorText = errors.map(function(error) {
		return 'エラー: ' + (error.text || 'Unknown error') + '\n場所: ' + (error.url || 'unknown') + (error.line ? ':' + error.line : '');
	}).join('\n\n');
	
	return aiPromptTemplate.replace('{error}', errorText);
}

// ページ読み込み時の処理
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

