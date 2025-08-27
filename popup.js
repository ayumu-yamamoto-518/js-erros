var switchersStates = {};

function copyToClipboard(str) {
	document.oncopy = function(event) {
		event.clipboardData.setData('text/plain', str);
		event.preventDefault();
	};
	document.execCommand('Copy', false, null);
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

		clearNode.onclick = function() {
			closePopup(isIFrame);
		};

		copyNode.onclick = function() {
			var isWindows = navigator.appVersion.indexOf('Windows') != -1;
			copyToClipboard(request.errors.replace(/<br\/>/g, isWindows ? '\r\n' : '\n').replace(/<.*?>/g, ''));
			closePopup();
		};

		copyWithAINode.onclick = async function() {
			var isWindows = navigator.appVersion.indexOf('Windows') != -1;
			var errorText = request.errors.replace(/<br\/>/g, isWindows ? '\r\n' : '\n').replace(/<.*?>/g, '');
			var aiPromptTemplate = await getStorageValue('aiPromptTemplate', 'Please help me fix this JavaScript error:\n\n{error}\n\nPlease provide a solution with explanation.');
			var aiPrompt = aiPromptTemplate.replace(/{error}/g, errorText);
			copyToClipboard(aiPrompt);
			closePopup();
		};
	}

	window.addEventListener('message', function(event) {
		if(typeof event.data == 'object' && event.data._reloadPopup) {
			request = parseUrl(event.data.url);
			errorsNode.innerHTML = request.errors;
			setTimeout(autoSize, 100);
			setTimeout(autoSize, 500); // hot fix for slow CPU
		}
	});
});

