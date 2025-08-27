// Service Worker event listeners
self.addEventListener('install', function(event) {
	console.log('Service Worker installing...');
	self.skipWaiting();
});

self.addEventListener('activate', function(event) {
	console.log('Service Worker activating...');
	event.waitUntil(self.clients.claim());
});

// Simple HTML entities function without document
function htmlentities(str) {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

function getBaseHostByUrl(url) {
	var localUrlRegexp = /(file:\/\/.*)|(:\/\/[^.:]+([\/?:]|$))/; // file:// | local
	var rootHostRegexp = /:\/\/(([\w-]+\.\w+)|(\d+\.\d+\.\d+\.\d+)|(\[[\w:]+\]))([\/?:]|$)/; // domain.com | IPv4 | IPv6
	var subDomainRegexp = /:\/\/([^\/]*\.([\w-]+\.\w+))([\/?:]|$)/; // sub.domain.com
	return localUrlRegexp.exec(url) ? 'localhost' : (rootHostRegexp.exec(url) || subDomainRegexp.exec(url))[1];
}

// Storage helper functions
function getStorageValue(key, defaultValue) {
	return new Promise((resolve) => {
		chrome.storage.local.get([key], function(result) {
			resolve(result[key] !== undefined ? result[key] : defaultValue);
		});
	});
}

function setStorageValue(key, value) {
	return new Promise((resolve) => {
		chrome.storage.local.set({[key]: value}, resolve);
	});
}

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

function getIgnoredUrlHash(url) {
	return url.replace(/\d+/g, '');
}

// Web request error listener for network errors
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

// Ensure message listener is always active
chrome.runtime.onMessage.addListener(function(data, sender, sendResponse) {
	if(data._initPage) {
		handleInitRequest(data, sender, sendResponse);
	}
	else if(data._errors) {
		handleErrorsRequest(data, sender, sendResponse);
	}
	return true;
});

// Keep service worker alive
chrome.runtime.onStartup.addListener(function() {
	initDefaultOptions();
});
