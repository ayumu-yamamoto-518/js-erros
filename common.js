/**
 * common.jsは複数のスクリプトで共有される共通機能を提供する
 * URL解析、メッセージ送信、ポップアップ制御などのユーティリティ関数を含む
 * 
 * 主な機能：
 * 1. URL解析
 *    - クエリパラメータの解析とデコード
 *    - tabIdの数値変換
 * 
 * 2. メッセージ通信
 *    - iframe内でのpostMessage通信
 *    - 通常ページでのchrome.tabs.sendMessage通信
 *    - 送信元識別のためのフラグ付与
 * 
 * 3. ポップアップ制御
 *    - ポップアップサイズの自動調整
 *    - ポップアップの閉じる機能
 *    - エラークリア機能
 * 
 * 4. 環境判定
 *    - iframe内かどうかの判定
 *    - 実行環境に応じた処理分岐
 */

/** @type {Object} URLパラメータを解析した結果オブジェクト */
var request = parseUrl(window.location.href);

/** @type {boolean} 現在のページがiframe内かどうか */
var isIFrame = window.top != window;

/**
 * URLからクエリパラメータを解析する関数
 * 
 * URLのクエリ部分（?以降）を解析し、パラメータ名と値のオブジェクトを返す。
 * tabIdパラメータが存在する場合、数値に変換する。
 * 
 * @param {string} url - 解析するURL
 * @returns {Object} パラメータ名と値のオブジェクト
 * 
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
			params.tabId = +params.tabId; // 数値に変換
		}
	}
	return params;
}

/**
 * メッセージを送信する関数
 * 
 * 実行環境に応じて適切な通信方法を選択する。
 * iframe内の場合はpostMessageを使用し、
 * 通常のページの場合はchrome.tabs.sendMessageを使用する。
 * 送信元を識別するため、メッセージに_fromJENフラグを付与する。
 * 
 * @param {Object} data - 送信するメッセージデータ
 * @returns {void}
 * 
 */
function sendMessage(data) {
	data._fromJEN = true; // 送信元識別フラグ
	
	if(isIFrame) {
		// iframe内の場合：postMessageを使用
		window.top.postMessage(data, '*');
	}
	else if(request.tabId) {
		// 通常ページの場合：chrome.tabs.sendMessageを使用
		chrome.tabs.sendMessage(request.tabId, data);
	}
}

/**
 * ポップアップのサイズを自動調整する関数
 * 
 * iframe内で実行されている場合、親ウィンドウにサイズ情報を送信する
 * ポップアップの幅と高さを計算し、_resizeメッセージとして送信する
 * 
 * @returns {void}
 * 
 * @example
 * // ページ読み込み完了時に自動実行
 * window.onload = autoSize;
 */
function autoSize() {
	if(isIFrame) {
		sendMessage({
			_resize: true,
			width: document.body.scrollWidth + 10,  // 幅に余裕を持たせる
			height: document.body.scrollHeight + 15 // 高さに余裕を持たせる
		});
	}
}

/**
 * ポップアップを閉じる関数
 * 
 * ポップアップを閉じる処理を実行する。エラークリアオプションが指定された場合、
 * エラー情報もクリアする。iframe内でない場合はwindow.close()を実行する
 * 
 * @param {boolean} clear - エラーをクリアするかどうか（デフォルト: false）
 * @returns {void}
 * 
 * @example
 * // ポップアップを閉じる（エラーはクリアしない）
 * closePopup();
 * 
 * // ポップアップを閉じる（エラーもクリアする）
 * closePopup(true);
 */
function closePopup(clear) {
	// ポップアップ閉じるメッセージを送信
	sendMessage({
		_closePopup: true
	});
	
	// エラークリアが指定された場合
	if(clear) {
		sendMessage({
			_clear: true
		});
	}
	
	// iframe内でない場合はwindow.close()を実行
	if(!isIFrame) {
		window.close();
	}
}

/**
 * ページ読み込み完了時の自動サイズ調整
 * 
 * ページの読み込みが完了した際に、ポップアップのサイズを自動調整する。
 * autoSize関数をwindow.onloadイベントに設定する。
 * 
 * @returns {void}
 * 
 * @example
 * // 自動的に実行される（ページ読み込み完了時）
 * window.onload = autoSize;
 */
window.onload = autoSize;