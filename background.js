/**
 * JavaScript Errors Notifier - Service Worker
 * 
 * エラー検知とポップアップ表示を管理します。
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

// デフォルト設定を初期化
async function initDefaultOptions() {
	var aiPromptTemplate = await getStorageValue('aiPromptTemplate', '以下のJavaScriptエラーを解析して修正方法を教えてください：\n\n{error}');
	if(!aiPromptTemplate) {
		await setStorageValue('aiPromptTemplate', '以下のJavaScriptエラーを解析して修正方法を教えてください：\n\n{error}');
	}
}

// 初期化
initDefaultOptions();

// メッセージリスナー
chrome.runtime.onMessage.addListener(function(data, sender, sendResponse) {
	if(data._initPage) {
		// ページ初期化
		chrome.action.setTitle({
			tabId: sender.tab.id,
			title: 'JavaScript Errors Notifier'
		});
		chrome.action.setPopup({
			tabId: sender.tab.id,
			popup: 'popup.html?tabId=' + sender.tab.id
		});
		sendResponse({});
	}
	else if(data._errors) {
		// エラー処理
		chrome.action.setTitle({
			tabId: sender.tab.id,
			title: 'JavaScriptエラーが発生しています'
		});
		chrome.action.setIcon({
			tabId: sender.tab.id,
			path: {
				"19": "img/error_19.png",
				"38": "img/error_38.png"
			}
		});
		
		// エラーデータをポップアップに渡す
		var popupUrl = 'popup.html?tabId=' + sender.tab.id + '&errors=' + encodeURIComponent(JSON.stringify(data.errors));
		chrome.action.setPopup({
			tabId: sender.tab.id,
			popup: popupUrl
		});
		
		sendResponse(popupUrl);
	}
	return true;
});
