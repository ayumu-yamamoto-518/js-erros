/**
 * JavaScript Errors Notifier - Service Worker
 * 
 * このファイルはブラウザ拡張機能のService Workerとして動作し、
 * JavaScriptエラーの検出、通知、設定管理を担当します。
 * 
 * @version 3.1.4
 * @author JavaScript Errors Notifier
 */

// Service Worker event listeners
self.addEventListener('install', function(event) {
	console.log('Service Worker installing...');
	self.skipWaiting();
});

self.addEventListener('activate', function(event) {
	console.log('Service Worker activating...');
	event.waitUntil(self.clients.claim());
});

/**
 * HTMLエンティティをエスケープする関数
 * Service Workerではdocumentオブジェクトが利用できないため、
 * 正規表現ベースで実装しています。
 * 
 * @param {string} str - エスケープする文字列
 * @returns {string} HTMLエンティティがエスケープされた文字列
 */
function htmlentities(str) {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

/**
 * URLからベースホスト名を抽出する関数
 * 
 * @param {string} url - 解析するURL
 * @returns {string} ベースホスト名（例：example.com）
 */
function getBaseHostByUrl(url) {
	var localUrlRegexp = /(file:\/\/.*)|(:\/\/[^.:]+([\/?:]|$))/; // file:// | local
	var rootHostRegexp = /:\/\/(([\w-]+\.\w+)|(\d+\.\d+\.\d+\.\d+)|(\[[\w:]+\]))([\/?:]|$)/; // domain.com | IPv4 | IPv6
	var subDomainRegexp = /:\/\/([^\/]*\.([\w-]+\.\w+))([\/?:]|$)/; // sub.domain.com
	return localUrlRegexp.exec(url) ? 'localhost' : (rootHostRegexp.exec(url) || subDomainRegexp.exec(url))[1];
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
 * デフォルト設定を初期化する関数
 * 拡張機能の初回起動時にデフォルト値を設定します。
 * 
 * @returns {Promise<void>}
 */
async function initDefaultOptions() {
	var optionsValues = {
		showIcon: true,
		ignore404others: true,
		ignoreBlockedByClient: true,
		relativeErrorUrl: true,
		popupMaxWidth: 70,
		popupMaxHeight: 40,
		aiPromptTemplate: 'Please help me fix this JavaScript error:\n\n{error}\n\nPlease provide a solution with explanation.'
	};
	
	for(var option in optionsValues) {
		var value = await getStorageValue(option, undefined);
		if(value === undefined) {
			var defaultValue = optionsValues[option];
			await setStorageValue(option, typeof(defaultValue) == 'boolean' ? (defaultValue ? 1 : '') : defaultValue);
		}
	}
}

// Initialize when service worker starts
initDefaultOptions();

// Ignore net::ERR_BLOCKED_BY_CLIENT initiated by AdPlus & etc
var ignoredUrlsHashes = {};
var ignoredUrlsLimit = 100;

/**
 * URLの種類に基づいて404エラーを無視するかどうかを判定する関数
 * 
 * @param {string} url - チェックするURL
 * @returns {Promise<boolean>} 無視する場合はtrue、そうでなければfalse
 */
async function isUrlIgnoredByType(url) {
	if(!url.indexOf('chrome-extension://')) { // ignore Google Chrome extensions 404 errors
		return true;
	}
	var ext = url.split('.').pop().split(/\#|\?/)[0].toLowerCase();
	if(ext == 'js') {
		return await getStorageValue('ignore404js', false);
	}
	if(ext == 'css') {
		return await getStorageValue('ignore404css', false);
	}
	return await getStorageValue('ignore404others', true);
}

/**
 * URLからハッシュ値を生成する関数
 * 数字を除去してURLの正規化を行います。
 * 
 * @param {string} url - ハッシュ化するURL
 * @returns {string} 正規化されたURL
 */
function getIgnoredUrlHash(url) {
	return url.replace(/\d+/g, '');
}

/**
 * ネットワークエラーのリスナー
 * webRequest APIを使用してネットワークエラーを検出し、
 * 設定に基づいてフィルタリングします。
 */
chrome.webRequest.onErrorOccurred.addListener(async function(e) {
	var ignoreBlockedByClient = await getStorageValue('ignoreBlockedByClient', true);
	var ignoreConnectionRefused = await getStorageValue('ignoreConnectionRefused', false);
	
	if((ignoreBlockedByClient && e.error == 'net::ERR_BLOCKED_BY_CLIENT') ||
		(ignoreConnectionRefused && e.error == 'net::ERR_CONNECTION_REFUSED')) {
		var url = getIgnoredUrlHash(e.url);
		if(!(await isUrlIgnoredByType(url))) {
			if(ignoredUrlsHashes[url]) { // move url in the end of list
				delete ignoredUrlsHashes[url];
			}
			ignoredUrlsHashes[url] = true;
			var ignoredUrlsArray = Object.keys(ignoredUrlsHashes);
			if(ignoredUrlsArray.length > ignoredUrlsLimit) {
				delete ignoredUrlsHashes[ignoredUrlsArray[0]];
			}
		}
	}
}, {urls: ["<all_urls>"]});

/**
 * ページ初期化リクエストを処理する関数
 * 新しいページが読み込まれた際に呼び出され、
 * タブの設定とアクションアイコンの初期化を行います。
 * 
 * @param {Object} data - リクエストデータ
 * @param {Object} sender - 送信者情報
 * @param {Function} sendResponse - レスポンス送信関数
 * @returns {Promise<void>}
 */
async function handleInitRequest(data, sender, sendResponse) {
	var tabHost = getBaseHostByUrl(data.url);
	chrome.tabs.get(sender.tab.id, function callback() { // mute closed tab error
		if(chrome.runtime.lastError) {
			return;
		}
		chrome.action.setTitle({
			tabId: sender.tab.id,
			title: 'No errors on this page'
		});
		chrome.action.setPopup({
			tabId: sender.tab.id,
			popup: 'popup.html?host=' + encodeURIComponent(tabHost) + '&tabId=' + sender.tab.id
		});
		chrome.action.show(sender.tab.id);
	});
	
	var showIcon = await getStorageValue('icon_' + tabHost, await getStorageValue('showIcon', true));
	var showPopup = await getStorageValue('popup_' + tabHost, await getStorageValue('showPopup', false));
	var showPopupOnMouseOver = await getStorageValue('showPopupOnMouseOver', false);
	var popupMaxWidth = await getStorageValue('popupMaxWidth', 70);
	var popupMaxHeight = await getStorageValue('popupMaxHeight', 40);
	
	sendResponse({
		showIcon: showIcon,
		showPopup: showPopup,
		showPopupOnMouseOver: showPopupOnMouseOver,
		popupMaxWidth: popupMaxWidth,
		popupMaxHeight: popupMaxHeight
	});
}

/**
 * エラーリクエストを処理する関数
 * JavaScriptエラーが検出された際に呼び出され、
 * エラーの整形、フィルタリング、通知の表示を行います。
 * 
 * @param {Object} data - エラーデータ
 * @param {Object} sender - 送信者情報
 * @param {Function} sendResponse - レスポンス送信関数
 * @returns {Promise<void>}
 */
async function handleErrorsRequest(data, sender, sendResponse) {
	var popupErrors = [];
	var tabHost = getBaseHostByUrl(data.url);
	var tabBaseUrl = (/^([\w-]+:\/\/[^\/?]+)/.exec(data.url) || [null, null])[1];

	for(var i in data.errors) {
		var error = data.errors[i];
		var errorHost = getBaseHostByUrl(error.url);
		var ignoreExternal = await getStorageValue('ignoreExternal', false);
		if(ignoreExternal && errorHost != tabHost) {
			continue;
		}
		if(error.is404) {
			if(ignoredUrlsHashes[getIgnoredUrlHash(error.url)] || (await isUrlIgnoredByType(error.url))) {
				delete data.errors[i];
				continue;
			}
			error.type = 'File not found';
			error.text = error.url;
			popupErrors.unshift('File not found: ' + htmlentities(error.url));
		}
		else {
			error.text = error.text.replace(/^Uncaught /, '').replace(/^Error: /, '');

			var linkStackOverflow = await getStorageValue('linkStackOverflow', false);
			var errorHtml = linkStackOverflow
				? '<a target="_blank" href="http://www.google.com/search?q=' + encodeURIComponent(htmlentities(error.text)) + '%20site%3Astackoverflow.com" id="">' + htmlentities(error.text) + '</a>'
				: htmlentities(error.text);

			var m = new RegExp('^(\\w+):\s*(.+)').exec(error.text);
			error.type = m ? m[1] : 'Uncaught Error';

			var showColumn = await getStorageValue('showColumn', false);
			if(showColumn && error.line && error.col) {
				error.line = error.line + ':' + error.col;
			}

			var lines;
			var showTrace = await getStorageValue('showTrace', false);
			if(showTrace && error.stack && (lines = error.stack.replace(/\n\s*at\s+/g, '\n').split('\n')).length > 2) {
				lines.shift();
				for(var ii in lines) {
					var urlMatch = /^(.*?)\(?(([\w-]+):\/\/.*?)(\)|$)/.exec(lines[ii]);
					var url = urlMatch ? urlMatch[2] : null;
					var method = urlMatch ? urlMatch[1].trim() : lines[ii];
					var lineMatch = url ? (showColumn ? /^(.*?):([\d:]+)$/ : /^(.*?):(\d+)(:\d+)?$/).exec(url) : null;
					var line = lineMatch ? lineMatch[2] : null;
					url = lineMatch ? lineMatch[1] : url;
					if(!url && method == 'Error (native)') {
						continue;
					}
					errorHtml += '<br/>&nbsp;';
					if(url) {
						var linkViewSource = await getStorageValue('linkViewSource', false);
						errorHtml += linkViewSource
							? ('<a href="view-source:' + url + (line ? '#' + line : '') + '" target="_blank">' + url + (line ? ':' + line : '') + '</a>')
							: (url + (line ? ':' + line : ''));
					}
					if(method) {
						errorHtml += ' ' + method + '()';
					}
				}

			}
			else {
				var url = error.url + (error.line ? ':' + error.line : '');
				var linkViewSource = await getStorageValue('linkViewSource', false);
				errorHtml += '<br/>&nbsp;' + (linkViewSource
					? '<a href="view-source:' + error.url + (error.line ? '#' + error.line : '') + '" target="_blank">' + url + '</a>'
					: url);
			}
			popupErrors.push(errorHtml);
		}
	}

	if(!popupErrors.length) {
		return;
	}

	// Get storage values before the callback
	var relativeErrorUrl = await getStorageValue('relativeErrorUrl', true);
	var linkViewSource = await getStorageValue('linkViewSource', false);
	
	chrome.tabs.get(sender.tab.id, function callback() { // mute closed tab error
		if(chrome.runtime.lastError) {
			return;
		}

		chrome.action.setTitle({
			tabId: sender.tab.id,
			title: 'There are some errors on this page. Click to see details.'
		});

		chrome.action.setIcon({
			tabId: sender.tab.id,
			path: {
				"19": "img/error_19.png",
				"38": "img/error_38.png"
			}
		});

		var errorsHtml = popupErrors.join('<br/><br/>');
		
		if(relativeErrorUrl && tabBaseUrl) {
			errorsHtml = errorsHtml.split(tabBaseUrl + '/').join('/').split(tabBaseUrl).join('/');
			if(linkViewSource) {
				errorsHtml = errorsHtml.split('href="view-source:/').join('href="view-source:' + tabBaseUrl + '/');
			}
		}

		var popupUri = 'popup.html?errors=' + encodeURIComponent(errorsHtml) + '&host=' + encodeURIComponent(tabHost) + '&tabId=' + sender.tab.id;

		chrome.action.setPopup({
			tabId: sender.tab.id,
			popup: popupUri
		});

		chrome.action.show(sender.tab.id);

		sendResponse(chrome.runtime.getURL(popupUri));
	});
}

/**
 * メッセージリスナー
 * content scriptからのメッセージを受信し、適切な処理関数に振り分けます。
 */
chrome.runtime.onMessage.addListener(function(data, sender, sendResponse) {
	if(data._initPage) {
		handleInitRequest(data, sender, sendResponse);
	}
	else if(data._errors) {
		handleErrorsRequest(data, sender, sendResponse);
	}
	return true;
});

/**
 * 拡張機能起動時のリスナー
 * Service Workerの起動時にデフォルト設定を初期化します。
 */
chrome.runtime.onStartup.addListener(function() {
	initDefaultOptions();
});
