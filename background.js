/**
 * background.jsは、Chrome拡張機能のService Workerとして動作し、エラー検知とポップアップ表示の管理を行う
 * 
 * 主な機能：
 * 1. エラー検知の管理
 *    - content.jsから送信されるエラー情報を受信
 *    - エラー発生時にブラウザアクションのアイコンとタイトルを更新
 *    - エラーデータをポップアップに渡すためのURLを生成
 * 
 * 2. 設定管理
 *    - AIプロンプトテンプレートの初期化と管理
 *    - chrome.storage.localを使用した設定の永続化
 * 
 * 3. ページ初期化
 *    - 新しいタブでの拡張機能の初期化
 *    - ブラウザアクションのタイトルとポップアップURLの設定
 * 
 * 4. メッセージ通信
 *    - content.jsからのメッセージ受信と処理
 *    - エラー情報の集約とポップアップへの転送
 * 
 */

/**
 * デバッグログを出力する関数
 * 
 * @param {string} message - 出力するメッセージ
 * @returns {void}
 */
function debugLog(message) {
	console.log('[JEN Service Worker]', message);
}

/**
 * chrome.storage.localから設定値を取得する関数
 * 
 * @param {string} key - 取得する設定のキー
 * @param {*} defaultValue - 設定が存在しない場合のデフォルト値
 * @returns {Promise<*>} 設定値またはデフォルト値
 * 
 * @example
 * const template = await getStorageValue('aiPromptTemplate', 'デフォルトテンプレート');
 */
function getStorageValue(key, defaultValue) {
	return new Promise((resolve) => {
		chrome.storage.local.get([key], function(result) {
			resolve(result[key] !== undefined ? result[key] : defaultValue);
		});
	});
}

/**
 * chrome.storage.localに設定値を保存する関数
 * 
 * @param {string} key - 保存する設定のキー
 * @param {*} value - 保存する値
 * @returns {Promise<void>} 保存完了を示すPromise
 * 
 * @example
 * await setStorageValue('aiPromptTemplate', '新しいテンプレート');
 */
function setStorageValue(key, value) {
	return new Promise((resolve) => {
		chrome.storage.local.set({[key]: value}, resolve);
	});
}

/**
 * デフォルト設定を初期化する関数
 * 
 * AIプロンプトテンプレートが存在しない場合、デフォルト値を設定する
 * 
 * @returns {Promise<void>} 初期化完了を示すPromise
 * 
 * @example
 * await initDefaultOptions();
 */
async function initDefaultOptions() {
	debugLog('Initializing default options...');
	var aiPromptTemplate = await getStorageValue('aiPromptTemplate', '以下のJavaScriptエラーを解析して修正方法を教えてください：\n\n{error}');
	if(!aiPromptTemplate) {
		await setStorageValue('aiPromptTemplate', '以下のJavaScriptエラーを解析して修正方法を教えてください：\n\n{error}');
	}
	debugLog('Default options initialized');
}

/**
 * ページ初期化処理を行う関数
 * 
 * 新しいタブでの拡張機能の初期化を行い、ブラウザアクションのタイトルとポップアップURLを設定する
 * 
 * @param {number} tabId - 初期化するタブのID
 * @returns {Promise<void>} 初期化完了を示すPromise
 * 
 * @example
 * await handlePageInit(12345);
 */
async function handlePageInit(tabId) {
	debugLog('Handling init request from tab: ' + tabId);
	
	// ブラウザアクションのタイトルを設定
	await chrome.action.setTitle({
		tabId: tabId,
		title: 'JavaScript Errors Notifier'
	});
	
	// ポップアップURLを設定
	await chrome.action.setPopup({
		tabId: tabId,
		popup: 'popup.html?tabId=' + tabId
	});
	
	debugLog('Init completed for tab: ' + tabId);
}

/**
 * エラー処理を行う関数
 * 
 * エラーが発生した際に、ブラウザアクションのアイコンとタイトルを更新し、エラーデータをポップアップに渡すためのURLを生成する。
 * 
 * @param {number} tabId - エラーが発生したタブのID
 * @param {Array<Object>} errors - エラー情報の配列
 * @returns {Promise<string>} ポップアップURL
 * 
 * @example
 * const popupUrl = await handleErrors(12345, [{text: 'エラーメッセージ', url: 'example.com'}]);
 */
async function handleErrors(tabId, errors) {
	debugLog('Handling errors request from tab: ' + tabId + ', errors count: ' + errors.length);
	
	// ブラウザアクションのタイトルを更新
	await chrome.action.setTitle({
		tabId: tabId,
		title: 'JavaScriptエラーが発生しています'
	});
	
	// ブラウザアクションのアイコンをエラー状態に変更
	await chrome.action.setIcon({
		tabId: tabId,
		path: {
			"19": "img/error_19.png",
			"38": "img/error_38.png"
		}
	});
	
	// エラーデータをポップアップに渡すためのURLを生成
	var popupUrl = 'popup.html?tabId=' + tabId + '&errors=' + encodeURIComponent(JSON.stringify(errors));
	
	// ポップアップURLを設定
	await chrome.action.setPopup({
		tabId: tabId,
		popup: popupUrl
	});
	
	debugLog('Sending popup URL: ' + popupUrl);
	return popupUrl;
}

// 初期化処理を実行
initDefaultOptions();

/**
 * メッセージリスナー
 * 
 * content.jsからのメッセージを受信し、適切な処理を実行する。
 * 
 * 対応するメッセージタイプ：
 * - _initPage: ページ初期化要求
 * - _errors: エラー情報の送信
 * 
 * @param {Object} data - 受信したメッセージデータ
 * @param {string} data._initPage - ページ初期化フラグ
 * @param {string} data._errors - エラー処理フラグ
 * @param {Array<Object>} data.errors - エラー情報の配列
 * @param {Object} sender - 送信者情報
 * @param {number} sender.tab.id - 送信元タブのID
 * @param {Function} sendResponse - レスポンス送信関数
 * @returns {boolean} true - 非同期レスポンスを示す
 *
 */
chrome.runtime.onMessage.addListener(function(data, sender, sendResponse) {
	debugLog('Message received: ' + JSON.stringify(data));
	
	// ページ初期化要求の処理
	if(data._initPage) {
		handlePageInit(sender.tab.id).then(() => {
			sendResponse({});
		});
	}
	// エラー情報の処理
	else if(data._errors) {
		handleErrors(sender.tab.id, data.errors).then((popupUrl) => {
			sendResponse(popupUrl);
		});
	}
	
	return true; // 非同期レスポンスを示す
});
