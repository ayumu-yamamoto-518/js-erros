/**
 * JavaScript Errors Notifier - Options Script
 * 
 * このファイルは拡張機能の設定ページを制御し、
 * ユーザー設定の保存と読み込みを担当します。
 * 
 * @version 3.1.4
 * @author JavaScript Errors Notifier
 */

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
 * DOM読み込み完了時の初期化処理
 * 設定項目の読み込み、イベントリスナーの設定、
 * 推奨機能の表示制御を行います。
 */
document.addEventListener('DOMContentLoaded', async function() {
	/** @type {Array<string>} 設定項目のID配列 */
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

	/**
	 * 各設定項目を初期化するループ
	 * チェックボックスとテキスト入力の両方に対応しています。
	 */
	for(var i in optionsIds) {
		var option = optionsIds[i];
		var value = await getStorageValue(option, '');
		var input = document.getElementById(option);

		if(input.type == 'checkbox') {
			if(value) {
				input.checked = true;
			}
			/**
			 * チェックボックスの変更イベントハンドラー
			 * 設定値をChrome Storageに保存します。
			 */
			input.onchange = (function(option) {
				return async function() {
					await setStorageValue(option, this.checked ? 1 : '');
				}
			})(option);
		}
		else {
			input.value = value;
			/**
			 * テキスト入力のキーアップイベントハンドラー
			 * 設定値をChrome Storageに保存します。
			 */
			input.onkeyup = (function(option) {
				return async function() {
					await setStorageValue(option, this.value);
				}
			})(option);
		}
	}

	/**
	 * 閉じるボタンのクリックハンドラー
	 * ポップアップを閉じます。
	 */
	document.getElementById('close').onclick = function() {
		closePopup();
	};

	/**
	 * 推奨機能の表示制御
	 * 既に通知済みまたは非表示設定の場合は推奨セクションを削除します。
	 */
	var jscrNotified = await getStorageValue('jscrNotified', false);
	var isRecommended = await getStorageValue('isRecommended', false);
	
	if(jscrNotified || isRecommended) {
		document.getElementById('recommendation').remove();
	}
	else {
		/** @type {Array<string>} 推奨リンクのID配列 */
		var linksIds = ['openRecommendation', 'hideRecommendation'];
		/**
		 * 推奨リンクのクリックハンドラー
		 * 推奨状態を保存し、適切なアクションを実行します。
		 */
		for(var i in linksIds) {
			document.getElementById(linksIds[i]).onclick = async function() {
				await setStorageValue('isRecommended', 3);
				closePopup();
				return this.id == 'openRecommendation';
			};
		}
	}
});

