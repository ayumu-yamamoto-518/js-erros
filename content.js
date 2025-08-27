/**
 * JavaScript Errors Notifier - Content Script
 * 
 * スクリプトエラーを検知してポップアップ通知を表示します。
 */

(function() {
	var errors = [];
	var isIFrame = window.top != window;

	// エラーを処理する関数
	function handleNewError(error) {
		errors.push(error);
		if(errors.length > 10) {
			errors.shift();
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

	// 通知を表示する関数
	function showNotification(popupUrl) {
		// 既存の通知を削除
		var existingNotifications = document.querySelectorAll('[data-jen-notification]');
		existingNotifications.forEach(function(notification) {
			notification.remove();
		});
		
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

	// グローバルエラーハンドラー
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

	// Promiseエラーハンドラー
	window.addEventListener('unhandledrejection', function(e) {
		handleNewError({
			text: e.reason.message || e.reason.toString(),
			url: window.location.href,
			line: null,
			col: null
		});
	});

	// console.errorをインターセプト
	var originalConsoleError = console.error;
	console.error = function() {
		originalConsoleError.apply(console, arguments);
		var message = Array.prototype.slice.call(arguments).join(' ');
		handleNewError({
			text: message,
			url: window.location.href,
			line: null,
			col: null
		});
	};

	// ページ初期化
	if(!isIFrame) {
		chrome.runtime.sendMessage({
			_initPage: true,
			url: window.location.href
		});
	}
	
	// 既存のエラーをチェック（少し遅延させて実行）
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
