/**
 * このファイルはChrome拡張機能のContent Scriptとして動作し、
 * ウェブページ内でJavaScriptエラーを検知してポップアップ通知を表示する
 * 
 * 主な機能：
 * 1. エラー検知
 *    - window.onerror: グローバルエラーの検知
 *    - unhandledrejection: Promiseエラーの検知
 *    - console.error: console.errorのインターセプト
 *    - 404エラー: 画像読み込みエラーの検知
 * 
 * 2. エラー管理
 *    - エラー情報の収集と蓄積（最大10件）
 *    - Service Workerへのエラー情報送信
 * 
 * 3. 通知表示
 *    - 画面右上へのポップアップ通知表示
 *    - 自動消去機能（5秒後）
 *    - 手動閉じる機能
 * 
 * 4. ページ初期化
 *    - Service Workerへの初期化メッセージ送信
 *    - iframe判定による処理分岐
 * 
 */

(function() {
	/** @type {Array<Object>} 検知されたエラーの配列（最大10件） */
	var errors = [];
	
	/** @type {boolean} 現在のページがiframe内かどうか */
	var isIFrame = window.top != window;

	/**
	 * 新しいエラーを処理する関数
	 * 
	 * エラー情報を配列に追加し、Service Workerに送信してポップアップ通知を表示する
	 * エラー数が10件を超えた場合、古いエラーから削除する
	 * 
	 * @param {Object} error - エラー情報オブジェクト
	 * @param {string} error.text - エラーメッセージ
	 * @param {string} error.url - エラーが発生したURL
	 * @param {number|null} error.line - エラーが発生した行番号
	 * @param {number|null} error.col - エラーが発生した列番号
	 * @returns {void}
	 * 
	 */
	function handleNewError(error) {
		errors.push(error);
		if(errors.length > 10) {
			errors.shift(); // 古いエラーを削除
		}
		
		// Service Workerにエラーを送信
		chrome.runtime.sendMessage({
			_errors: true,
			errors: errors,
			url: window.location.href
		}, function(popupUrl) {
			if(popupUrl) {
				showNotification(popupUrl);
			}
		});
	}

	/**
	 * 通知を表示する関数
	 * 
	 * 画面右上にポップアップ通知を表示します。既存の通知がある場合は削除してから
	 * 新しい通知を表示します。5秒後に自動で消去される
	 * 
	 * @param {string} popupUrl - ポップアップのURL（現在は未使用）
	 * @returns {void}
	 * 
	 */
	function showNotification(popupUrl) {
		// 既存の通知を削除
		var existingNotifications = document.querySelectorAll('[data-jen-notification]');
		existingNotifications.forEach(function(notification) {
			notification.remove();
		});
		
		// 新しい通知要素を作成
		var notification = document.createElement('div');
		notification.setAttribute('data-jen-notification', 'true');
		notification.style.cssText = 'position: fixed !important; top: 20px !important; right: 20px !important; z-index: 2147483647 !important; background: white !important; border: 2px solid #ff4444 !important; border-radius: 8px !important; padding: 15px !important; box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important; max-width: 300px !important; font-family: Arial, sans-serif !important; font-size: 14px !important;';
		notification.innerHTML = '<div style="font-weight: bold; color: #ff4444; margin-bottom: 10px;">JavaScriptエラーが発生しました</div><div style="margin-bottom: 10px;">エラー数: ' + errors.length + '</div><button onclick="this.parentElement.remove()" style="background: #ff4444; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">閉じる</button>';
		
		// bodyが存在するかチェック
		if(document.body) {
			document.body.appendChild(notification);
		} else {
			// bodyが存在しない場合は、DOMContentLoadedを待つ
			document.addEventListener('DOMContentLoaded', function() {
				document.body.appendChild(notification);
			});
		}
		
		// 5秒後に自動で消す
		setTimeout(function() {
			if(notification.parentElement) {
				notification.remove();
			}
		}, 5000);
	}

	/**
	 * グローバルエラーハンドラー
	 * 
	 * window.onerrorイベントを監視し、JavaScriptエラーを検知する
	 * エラーが発生した場合、handleNewError関数を呼び出してエラー情報を処理する
	 * 
	 * @param {ErrorEvent} e - エラーイベントオブジェクト
	 * @param {string} e.message - エラーメッセージ
	 * @param {string} e.filename - エラーが発生したファイル名
	 * @param {number} e.lineno - エラーが発生した行番号
	 * @param {number} e.colno - エラーが発生した列番号
	 * @returns {void}
	 * 
	 */
	window.addEventListener('error', function(e) {
		if(e.filename) {
			handleNewError({
				text: e.message,
				url: e.filename,
				line: e.lineno,
				col: e.colno
			});
		}
	});

	/**
	 * Promiseエラーハンドラー
	 * 
	 * unhandledrejectionイベントを監視し、未処理のPromise拒否を検知する
	 * Promiseエラーが発生した場合、handleNewError関数を呼び出してエラー情報を処理する
	 * 
	 * @param {PromiseRejectionEvent} e - Promise拒否イベントオブジェクト
	 * @param {Error|string|Object} e.reason - 拒否された理由
	 * @returns {void}
	 * 
	 */
	window.addEventListener('unhandledrejection', function(e) {
		handleNewError({
			text: e.reason.message || e.reason.toString(),
			url: window.location.href,
			line: null,
			col: null
		});
	});

	/**
	 * console.errorをインターセプトする関数
	 * 
	 * 元のconsole.error関数を保持し、新しい関数でラップしてconsole.errorの呼び出しを検知する
	 * 元の機能は保持したまま、エラー情報をhandleNewError関数に送信する
	 * 
	 * @returns {void}
	 */
	var originalConsoleError = console.error;
	console.error = function() {
		// 元のconsole.errorを実行
		originalConsoleError.apply(console, arguments);
		
		// エラー情報を収集
		var message = Array.prototype.slice.call(arguments).join(' ');
		handleNewError({
			text: message,
			url: window.location.href,
			line: null,
			col: null
		});
	};

	/**
	 * ページ初期化処理
	 * 
	 * iframeでない場合、Service Workerに初期化メッセージを送信します。
	 * これにより、ブラウザアクションのタイトルとポップアップURLが設定されます。
	 * 
	 * @returns {void}
	 * 
	 * @example
	 * // 自動的に実行される（ページ読み込み時）
	 */
	if(!isIFrame) {
		chrome.runtime.sendMessage({
			_initPage: true,
			url: window.location.href
		});
	}
	
	/**
	 * 既存エラーのチェック処理
	 * 
	 * ページ読み込みから1秒後に実行され、既存のエラー（主に404エラー）をチェックする
	 * 画像が読み込まれていない場合、エラーとして検知する
	 * 
	 * @returns {void}
	 * 
	 */
	setTimeout(function() {
		// 既存のエラーがあるかチェック（例：404エラーなど）
		var images = document.querySelectorAll('img');
		images.forEach(function(img) {
			if(img.naturalWidth === 0 && img.naturalHeight === 0) {
				// 画像が読み込まれていない場合
				handleNewError({
					text: 'Failed to load resource: ' + img.src,
					url: window.location.href,
					line: null,
					col: null
				});
			}
		});
	}, 1000);
})();
