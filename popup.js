/**
 * JavaScript Errors Notifier - Popup Script
 * 
 * このファイルは拡張機能のポップアップUIを制御し、
 * エラー表示、設定切り替え、クリップボード機能を提供します。
 * 
 * @version 3.1.4
 * @author JavaScript Errors Notifier
 */

/** @type {Object} スイッチャーの状態を保持するオブジェクト */
var switchersStates = {};

/**
 * テキストをクリップボードにコピーする関数
 * 
 * @param {string} str - コピーする文字列
 */
function copyToClipboard(str) {
	document.oncopy = function(event) {
		event.clipboardData.setData('text/plain', str);
		event.preventDefault();
	};
	document.execCommand('Copy', false, null);
}

/**
 * Chrome Storageから値を取得するヘルパー関数
 * 
 * @param {string} key - 取得するキー
 * @param {*} defaultValue - キーが存在しない場合のデフォルト値
 * @returns {Promise<*>} 保存されている値またはデフォルト値
 */
function getStorageValue(key, defaultValue) {
	return new Promise((resolve) => {
		chrome.storage.local.get([key], function(result) {
			resolve(result[key] !== undefined ? result[key] : defaultValue);
		});
	});
}

/**
 * Chrome Storageに値を保存するヘルパー関数
 * 
 * @param {string} key - 保存するキー
 * @param {*} value - 保存する値
 * @returns {Promise<void>} 保存完了時のPromise
 */
function setStorageValue(key, value) {
	return new Promise((resolve) => {
		chrome.storage.local.set({[key]: value}, resolve);
	});
}

/**
 * オプションスイッチャーを初期化する関数
 * アイコンとポップアップの表示/非表示を切り替えるUIを設定します。
 * 
 * @param {HTMLElement} imgNode - スイッチャーの画像要素
 * @param {string} domainOption - ドメイン固有のオプションキー
 * @param {string} globalOption - グローバルオプションキー
 * @param {Array<string>} srcValues - オン/オフ状態の画像パス配列
 * @returns {Promise<void>}
 */
async function initOptionSwitcher(imgNode, domainOption, globalOption, srcValues) {
	var domainValue = await getStorageValue(domainOption, undefined);
	var globalValue = await getStorageValue(globalOption, false);
	switchersStates[domainOption] = domainValue !== undefined ? +domainValue : (globalValue ? 1 : 0);
	imgNode.src = srcValues[switchersStates[domainOption]];
	imgNode.onclick = async function() {
		switchersStates[domainOption] = +!switchersStates[domainOption];
		await setStorageValue(domainOption, switchersStates[domainOption] ? 1 : '');
		imgNode.src = srcValues[switchersStates[domainOption]];
	};
}

/**
 * DOM読み込み完了時の初期化処理
 * エラー表示、ボタン設定、スイッチャー初期化を行います。
 */
document.addEventListener('DOMContentLoaded', async function() {
	var errorsNode = document.getElementById('errors');
	var copyNode = document.getElementById('copy');
	var copyWithAINode = document.getElementById('copyWithAI');
	var clearNode = document.getElementById('clear');

	var iconNode = document.getElementById('showIcon');
	iconNode.title = 'Show error notification icon on ' + request.host;
	await initOptionSwitcher(iconNode, 'icon_' + request.host, 'showIcon', [
		'img/icon_off.png',
		'img/icon_on.png'
	]);

	var popupNode = document.getElementById('showPopup');
	popupNode.title = 'Show popup with errors details on ' + request.host;
	await initOptionSwitcher(popupNode, 'popup_' + request.host, 'showPopup', [
		'img/popup_off.png',
		'img/popup_on.png'
	]);

	if(!request.errors) {
		errorsNode.innerHTML = '<p style="padding: 20px">There are no errors on this page :)</p>';
		copyNode.remove();
		copyWithAINode.remove();
		clearNode.remove();
	}
	else {
		errorsNode.innerHTML = request.errors;

		/**
		 * クリアボタンのクリックハンドラー
		 * エラーをクリアしてポップアップを閉じます。
		 */
		clearNode.onclick = function() {
			closePopup(isIFrame);
		};

		/**
		 * コピーボタンのクリックハンドラー
		 * エラーテキストをクリップボードにコピーします。
		 */
		copyNode.onclick = function() {
			var isWindows = navigator.appVersion.indexOf('Windows') != -1;
			copyToClipboard(request.errors.replace(/<br\/>/g, isWindows ? '\r\n' : '\n').replace(/<.*?>/g, ''));
			closePopup();
		};

		/**
		 * AIコピーボタンのクリックハンドラー
		 * AIプロンプトテンプレートを使用してエラーをコピーします。
		 */
		copyWithAINode.onclick = async function() {
			var isWindows = navigator.appVersion.indexOf('Windows') != -1;
			var errorText = request.errors.replace(/<br\/>/g, isWindows ? '\r\n' : '\n').replace(/<.*?>/g, '');
			var aiPromptTemplate = await getStorageValue('aiPromptTemplate', 'Please help me fix this JavaScript error:\n\n{error}\n\nPlease provide a solution with explanation.');
			var aiPrompt = aiPromptTemplate.replace(/{error}/g, errorText);
			copyToClipboard(aiPrompt);
			closePopup();
		};
	}

	/**
	 * ポップアップリロードメッセージのリスナー
	 * iframeからのリロード要求を受信してポップアップを更新します。
	 */
	window.addEventListener('message', function(event) {
		if(typeof event.data == 'object' && event.data._reloadPopup) {
			request = parseUrl(event.data.url);
			errorsNode.innerHTML = request.errors;
			setTimeout(autoSize, 100);
			setTimeout(autoSize, 500); // hot fix for slow CPU
		}
	});
});

