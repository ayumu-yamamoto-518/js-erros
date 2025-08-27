/**
 * JavaScript Errors Notifier - Service Worker
 * 
 * エラー検知とポップアップ表示を管理します。
 */

// デバッグログ関数
function debugLog(message) {
	console.log('[JEN Service Worker]', message);
}

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
	debugLog('Initializing default options...');
	var aiPromptTemplate = await getStorageValue('aiPromptTemplate', '以下のJavaScriptエラーを解析して修正方法を教えてください：\n\n{error}');
	if(!aiPromptTemplate) {
		await setStorageValue('aiPromptTemplate', '以下のJavaScriptエラーを解析して修正方法を教えてください：\n\n{error}');
	}
	debugLog('Default options initialized');
}

// 初期化
initDefaultOptions();

// メッセージリスナー
chrome.runtime.onMessage.addListener(function(data, sender, sendResponse) {
	debugLog('Message received: ' + JSON.stringify(data));
	
	if(data._initPage) {
		debugLog('Handling init request from tab: ' + sender.tab.id);
		// ページ初期化
		chrome.action.setTitle({
			tabId: sender.tab.id,
			title: 'JavaScript Errors Notifier'
		});
		chrome.action.setPopup({
			tabId: sender.tab.id,
			popup: 'popup.html?tabId=' + sender.tab.id
		});
		debugLog('Init completed for tab: ' + sender.tab.id);
		sendResponse({});
	}
	else if(data._errors) {
		debugLog('Handling errors request from tab: ' + sender.tab.id + ', errors count: ' + data.errors.length);
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
		
		debugLog('Sending popup URL: ' + popupUrl);
		sendResponse(popupUrl);
	}
	return true;
});
