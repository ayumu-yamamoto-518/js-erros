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
		console.log('コピーしました');
	}).catch(function(err) {
		console.error('コピーに失敗しました:', err);
	});
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
	
	errors.forEach(function(error, index) {
		html += '<div class="log">';
		html += '<div class="head">';
		html += '<span class="pill error">ERROR</span>';
		html += '<span class="src">' + (error.url || 'unknown') + (error.line ? ':' + error.line : '') + '</span>';
		html += '</div>';
		html += '<div class="msg">' + (error.text || 'Unknown error') + '</div>';
		html += '</div>';
	});
	
	container.innerHTML = html;
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

