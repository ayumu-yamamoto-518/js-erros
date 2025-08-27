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

document.addEventListener('DOMContentLoaded', async function() {
	var optionsIds = [
		'showIcon',
		'showPopup',
		'showPopupOnMouseOver',
		'showColumn',
		'showTrace',
		'linkStackOverflow',
		'linkViewSource',
		'relativeErrorUrl',
		'ignore404js',
		'ignore404css',
		'ignore404others',
		'ignoreExternal',
		'ignoreBlockedByClient',
		'ignoreConnectionRefused',
		'popupMaxWidth',
		'popupMaxHeight',
		'aiPromptTemplate'
	];

	for(var i in optionsIds) {
		var option = optionsIds[i];
		var value = await getStorageValue(option, '');
		var input = document.getElementById(option);

		if(input.type == 'checkbox') {
			if(value) {
				input.checked = true;
			}
			input.onchange = (function(option) {
				return async function() {
					await setStorageValue(option, this.checked ? 1 : '');
				}
			})(option);
		}
		else {
			input.value = value;
			input.onkeyup = (function(option) {
				return async function() {
					await setStorageValue(option, this.value);
				}
			})(option);
		}
	}

	document.getElementById('close').onclick = function() {
		closePopup();
	};

	var jscrNotified = await getStorageValue('jscrNotified', false);
	var isRecommended = await getStorageValue('isRecommended', false);
	
	if(jscrNotified || isRecommended) {
		document.getElementById('recommendation').remove();
	}
	else {
		var linksIds = ['openRecommendation', 'hideRecommendation'];
		for(var i in linksIds) {
			document.getElementById(linksIds[i]).onclick = async function() {
				await setStorageValue('isRecommended', 3);
				closePopup();
				return this.id == 'openRecommendation';
			};
		}
	}
});

