/**
 * JavaScript Errors Notifier - Content Script
 * 
 * スクリプトエラーを検知してポップアップ通知を表示します。
 */

(function() {
	var errors = [];
	var isIFrame = window.top != window;

	// デバッグログ関数
	function debugLog(message) {
		console.log('[JEN Debug]', message);
	}

	debugLog('Content script loaded for: ' + window.location.href);

	// エラーを処理する関数
	function handleNewError(error) {
		debugLog('Handling new error: ' + JSON.stringify(error));
		errors.push(error);
		if(errors.length > 10) {
			errors.shift();
		}
		
		debugLog('Sending errors to service worker. Total errors: ' + errors.length);
		// Service Workerにエラーを送信
		chrome.runtime.sendMessage({
			_errors: true,
			errors: errors,
			url: window.location.href
		}, function(popupUrl) {
			debugLog('Received response from service worker: ' + popupUrl);
			if(popupUrl) {
				showNotification(popupUrl);
			} else {
				debugLog('No popup URL received from service worker');
			}
		});
	}

	// 通知を表示する関数
	function showNotification(popupUrl) {
		debugLog('Showing notification popup');
		
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
			debugLog('Notification added to body');
		} else {
			// bodyが存在しない場合は、DOMContentLoadedを待つ
			document.addEventListener('DOMContentLoaded', function() {
				document.body.appendChild(notification);
				debugLog('Notification added to body after DOMContentLoaded');
			});
		}
		
		// 5秒後に自動で消す
		setTimeout(function() {
			if(notification.parentElement) {
				notification.remove();
				debugLog('Notification auto-removed after 5 seconds');
			}
		}, 5000);
	}

	// グローバルエラーハンドラー
	window.addEventListener('error', function(e) {
		debugLog('Global error event triggered: ' + e.message + ' at ' + e.filename + ':' + e.lineno);
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
		debugLog('Unhandled promise rejection event triggered: ' + e.reason);
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
		debugLog('console.error intercepted: ' + Array.prototype.slice.call(arguments).join(' '));
		originalConsoleError.apply(console, arguments);
		var message = Array.prototype.slice.call(arguments).join(' ');
		handleNewError({
			text: message,
			url: window.location.href,
			line: null,
			col: null
		});
	};

	// テスト用：手動でエラーを発生させる関数をグローバルに公開
	window.testJENError = function() {
		debugLog('Manual error test triggered');
		handleNewError({
			text: 'Manual test error',
			url: window.location.href,
			line: null,
			col: null
		});
	};

	// テスト用：test.htmlのエラーを手動で発生させる関数
	window.triggerTestErrors = function() {
		debugLog('Triggering test errors manually');
		
		// console.errorを発生させる
		console.error('Test console.error message');
		
		// Promiseエラーを発生させる
		Promise.reject(new Error('Test Promise error'));
		
		// 404エラーを発生させる
		var img = new Image();
		img.onerror = function() {
			debugLog('Image error triggered');
			handleNewError({
				text: 'Failed to load resource: nonexistent-image.png',
				url: window.location.href,
				line: null,
				col: null
			});
		};
		img.src = 'nonexistent-image.png';
	};

	// ページ初期化
	if(!isIFrame) {
		debugLog('Sending init message to service worker');
		chrome.runtime.sendMessage({
			_initPage: true,
			url: window.location.href
		}, function(response) {
			debugLog('Received init response: ' + JSON.stringify(response));
		});
	}

	debugLog('Error detection setup completed');
	
	// 既存のエラーをチェック（少し遅延させて実行）
	setTimeout(function() {
		debugLog('Checking for existing errors...');
		// 手動でテストエラーを発生させる
		window.testJENError();
		
		// test.htmlのエラーを手動で発生させる
		window.triggerTestErrors();
	}, 1000);
})();
