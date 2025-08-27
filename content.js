/**
 * JavaScript Errors Notifier - Content Script
 * 
 * このファイルは各Webページに注入され、JavaScriptエラーの検出と
 * Service Workerへの通知を担当します。
 * 
 * @version 3.1.4
 * @author JavaScript Errors Notifier
 */

new function() {

	/** @type {Array} 検出されたエラーの配列 */
	var errors = [];
	/** @type {number} 保存するエラーの最大数 */
	var errorsLimit = 100;
	/** @type {number} 現在のタブID */
	var tabId;
	/** @type {number} エラー送信のタイマーID */
	var timer;
	/** @type {HTMLElement} エラー通知アイコン */
	var icon;
	/** @type {HTMLIFrameElement} エラー詳細ポップアップ */
	var popup;
	/** @type {Object} 拡張機能の設定オブジェクト */
	var options;
	/** @type {boolean} 現在のページがiframe内かどうか */
	var isIFrame = window.top != window;

	/**
	 * エラー詳細ポップアップを表示する関数
	 * 
	 * @param {string} popupUrl - ポップアップのURL
	 */
	function showPopup(popupUrl) {
		if(!popup) {
			popup = document.createElement('iframe');
			popup.src = popupUrl;
			popup.frameBorder = 0;
			popup.style.cssText = 'position: fixed !important; bottom: 50px !important; right: 50px !important; z-index: 2147483647 !important;';
			popup.height = '50px';
			(document.body || document.documentElement).appendChild(popup);
		}
		else {
			popup.contentWindow.postMessage({
				_reloadPopup: true,
				url: popupUrl
			}, '*');
		}
	}

	/**
	 * エラー通知を表示する関数
	 * 設定に基づいてアイコンとポップアップを表示します。
	 * 
	 * @param {string} popupUrl - ポップアップのURL
	 */
	function showErrorNotification(popupUrl) {
		if(options.showPopup) {
			showPopup(popupUrl);
		}

		if(!icon && (options.showIcon || options.showPopup)) {
			icon = document.createElement('img');
			icon.src = chrome.runtime.getURL('img/error_38.png');
			icon.title = 'Some errors occurred on this page. Click to see details.';
			icon.style.cssText = 'position: fixed !important; bottom: 10px !important; right: 10px !important; cursor: pointer !important; z-index: 2147483647 !important; width: 38px !important; height: 38px !important; min-height: 38px !important; min-width: 38px !important; max-height: 38px !important; max-width: 38px !important;';
			icon.onclick = function() {
				if(!popup) {
					showPopup(popupUrl);
				}
				else {
					popup.remove();
					popup = null;
				}
			};
			if(options.showPopupOnMouseOver) {
				icon.onmouseover = function() {
					if(!popup) {
						showPopup(popupUrl);
					}
				};
			}
			(document.body || document.documentElement).appendChild(icon);
		}
	}

	/**
	 * 新しいエラーを処理する関数
	 * 重複チェックを行い、Service Workerにエラー情報を送信します。
	 * 
	 * @param {Object} error - エラーオブジェクト
	 * @param {string} error.text - エラーメッセージ
	 * @param {string} error.url - エラーが発生したURL
	 * @param {number} error.line - エラーが発生した行番号
	 * @param {number} error.col - エラーが発生した列番号
	 */
	function handleNewError(error) {
		var lastError = errors[errors.length - 1];
		var isSameAsLast = lastError && lastError.text == error.text && lastError.url == error.url && lastError.line == error.line && lastError.col == error.col;
		var isWrongUrl = !error.url || error.url.indexOf('://') === -1;
		if(!isSameAsLast && !isWrongUrl) {
			errors.push(error);
			if(errors.length > errorsLimit) {
				errors.shift();
			}
			if(!timer) {
				timer = window.setTimeout(function() {
					timer = null;
					chrome.runtime.sendMessage({
						_errors: true,
						errors: errors,
						url: window.top.location.href
					}, function(popupUrl) {
						if(popupUrl) {
							showErrorNotification(popupUrl);
						}
					});
				}, 200);
			}
		}
	}

	/**
	 * カスタムエラーイベントのリスナー
	 * 注入されたスクリプトからエラー情報を受信します。
	 */
	document.addEventListener('ErrorToExtension', function(e) {
		var error = e.detail;
		if(isIFrame) {
			window.top.postMessage({
				_iframeError: true,
				_fromJEN: true,
				error: error
			}, '*');
		}
		else {
			handleNewError(error);
		}
	});

	/**
	 * ページに注入されるエラー検出スクリプト
	 * 各種JavaScriptエラーをキャッチしてカスタムイベントを発火します。
	 * 
	 * @returns {void}
	 */
	function codeToInject() {

		/**
		 * カスタムエラーを処理する関数
		 * 
		 * @param {string} message - エラーメッセージ
		 * @param {string} stack - スタックトレース
		 */
		function handleCustomError(message, stack) {
			if(!stack) {
				stack = (new Error()).stack.split("\n").splice(2, 4).join("\n");
			}

			var stackLines = stack.split("\n");
			var callSrc = (stackLines.length > 1 && (/^.*?\((.*?):(\d+):(\d+)/.exec(stackLines[1]) || /(\w+:\/\/.*?):(\d+):(\d+)/.exec(stackLines[1]))) || [null, null, null, null];

			document.dispatchEvent(new CustomEvent('ErrorToExtension', {
				detail: {
					stack: stackLines.join("\n"),
					url: callSrc[1],
					line: callSrc[2],
					col: callSrc[3],
					text: message
				}
			}));
		}

		// handle uncaught promises errors
		window.addEventListener('unhandledrejection', function(e) {
			if (typeof e.reason === 'undefined') {
				e.reason = e.detail;
			}
			handleCustomError(e.reason.message, e.reason.stack);
		});

		// handle console.error()
		var consoleErrorFunc = window.console.error;
		window.console.error = function() {
			var argsArray = [];
			for(var i in arguments) { // because arguments.join() not working! oO
				argsArray.push(arguments[i]);
			}
			consoleErrorFunc.apply(console, argsArray);

			handleCustomError(argsArray.length == 1 && typeof argsArray[0] == 'string' ? argsArray[0] : JSON.stringify(argsArray.length == 1 ? argsArray[0] : argsArray));
		};

		// handle uncaught errors
		window.addEventListener('error', function(e) {
			if(e.filename) {
				document.dispatchEvent(new CustomEvent('ErrorToExtension', {
					detail: {
						stack: e.error ? e.error.stack : null,
						url: e.filename,
						line: e.lineno,
						col: e.colno,
						text: e.message
					}
				}));
			}
		});

		// handle 404 errors
		window.addEventListener('error', function(e) {
			var src = e.target.src || e.target.href;
			var baseUrl = e.target.baseURI;
			if(src && baseUrl && src != baseUrl) {
				document.dispatchEvent(new CustomEvent('ErrorToExtension', {
					detail: {
						is404: true,
						url: src
					}
				}));
			}
		}, true);
	}

	// エラー検出スクリプトをページに注入
	var script = document.createElement('script');
	script.textContent = '(' + codeToInject + '())';
	(document.head || document.documentElement).appendChild(script);
	script.parentNode.removeChild(script);

	/**
	 * 内部メッセージを処理する関数
	 * Service Workerやiframeからのメッセージを処理します。
	 * 
	 * @param {Object} data - メッセージデータ
	 */
	function handleInternalMessage(data) {
		if(!isIFrame && (!data.tabId || data.tabId == tabId)) {
			if(data._clear) {
				errors = [];
				if(popup) {
					popup.remove();
					popup = null;
				}
				if(icon) {
					icon.remove();
					icon = null;
				}
			}
			else if(data._resize && popup) {
				var maxHeight = Math.round(window.innerHeight * options.popupMaxHeight / 100) - 60;
				var maxWidth = Math.round(window.innerWidth * options.popupMaxWidth / 100) - 60;
				var height = data.height < maxHeight ? data.height : maxHeight;
				var width = data.width < maxWidth ? data.width : maxWidth;
				popup.height = (width == maxWidth ? height + 10 : height) + 'px'; // scroll fix
				popup.width = (height == maxHeight ? width + 10 : width) + 'px'; // scroll fix
				popup.style.height = popup.height;
				popup.style.width = popup.width;
			}
			else if(data._closePopup && popup) {
				popup.style.display = 'none';
			}
			else if(data._iframeError) {
				handleNewError(data.error);
			}
		}
	}

	/**
	 * Service Workerからのメッセージリスナー
	 */
	chrome.runtime.onMessage.addListener(handleInternalMessage);

	/**
	 * iframe間通信のメッセージリスナー
	 */
	window.addEventListener('message', function(event) {
		if(typeof event.data === 'object' && event.data && typeof event.data._fromJEN !== 'undefined' && event.data._fromJEN) {
			handleInternalMessage(event.data);
		}
	});

	/**
	 * ページ初期化
	 * メインページ（iframeではない）の場合、Service Workerに初期化メッセージを送信
	 */
	if(!isIFrame) {
		chrome.runtime.sendMessage({
			_initPage: true,
			url: window.location.href
		}, function(response) {
			options = response;
		});
	}
};
