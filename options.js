/**
 * JavaScript Errors Notifier - Options Script
 * 
 * AIプロンプトテンプレートの設定を管理します。
 */

// 設定を取得する関数
function getStorageValue(key, defaultValue) {
	return new Promise((resolve) => {
		chrome.storage.local.get([key], function(result) {
			resolve(result[key] !== undefined ? result[key] : defaultValue);
		});
	});
}

// 設定を保存する関数
function setStorageValue(key, value) {
	return new Promise((resolve) => {
		chrome.storage.local.set({[key]: value}, resolve);
	});
}

// ページ読み込み時の処理
document.addEventListener('DOMContentLoaded', async function() {
	// 現在の設定を読み込み
	var aiPromptTemplate = await getStorageValue('aiPromptTemplate', '以下のJavaScriptエラーを解析して修正方法を教えてください：\n\n{error}');
	
	// テキストエリアに設定値を表示
	var textarea = document.getElementById('aiPromptTemplate');
	textarea.value = aiPromptTemplate;
	
	// 保存ボタンのイベントリスナー
	var saveButton = document.getElementById('saveButton');
	saveButton.onclick = async function() {
		var newTemplate = textarea.value;
		await setStorageValue('aiPromptTemplate', newTemplate);
		
		// 保存完了メッセージ
		saveButton.textContent = '保存完了！';
		setTimeout(function() {
			saveButton.textContent = '設定を保存';
		}, 2000);
	};
});

