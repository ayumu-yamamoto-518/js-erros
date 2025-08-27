/**
 * JavaScript Errors Notifier - Common Utilities
 * 
 * このファイルは複数のスクリプトで共有される共通機能を提供します。
 * URL解析、メッセージ送信、ポップアップ制御などのユーティリティ関数を含みます。
 * 
 * @version 3.1.4
 * @author JavaScript Errors Notifier
 */

/** @type {Object} URLパラメータを解析した結果オブジェクト */
var request = parseUrl(window.location.href);
/** @type {boolean} 現在のページがiframe内かどうか */
var isIFrame = window.top != window;

/**
 * URLからクエリパラメータを解析する関数
 * 
 * @param {string} url - 解析するURL
 * @returns {Object} パラメータ名と値のオブジェクト
 */
function parseUrl(url) {
	var params = {};
	var query = /\?(.*)/.exec(url);
	if(query) {
		var kvPairs = query[1].split('&');
		for(var i in kvPairs) {
			var kv = kvPairs[i].split('=');
			params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]);
		}
		if(params.tabId) {
			params.tabId = +params.tabId;
		}
	}
	return params;
}

/**
 * メッセージを送信する関数
 * iframe内の場合はpostMessageを使用し、
 * 通常のページの場合はchrome.tabs.sendMessageを使用します。
 * 
 * @param {Object} data - 送信するメッセージデータ
 */
function sendMessage(data) {
	data._fromJEN = true;
	if(isIFrame) {
		window.top.postMessage(data, '*');
	}
	else if(request.tabId) {
		chrome.tabs.sendMessage(request.tabId, data);
	}
}

/**
 * ポップアップのサイズを自動調整する関数
 * iframe内の場合、親ウィンドウにサイズ情報を送信します。
 */
function autoSize() {
	if(isIFrame) {
		sendMessage({
			_resize: true,
			width: document.body.scrollWidth + 10,
			height: document.body.scrollHeight + 15
		}, '*');
	}
}

/**
 * ポップアップを閉じる関数
 * 
 * @param {boolean} clear - エラーをクリアするかどうか
 */
function closePopup(clear) {
	sendMessage({
		_closePopup: true
	});
	if(clear) {
		sendMessage({
			_clear: true
		});
	}
	if(!isIFrame) {
		window.close();
	}
}

/**
 * ページ読み込み完了時の自動サイズ調整
 */
window.onload = autoSize;