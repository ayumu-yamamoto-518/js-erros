/**
 * このファイルはChrome拡張機能のオプションページを制御し、AIプロンプトテンプレートの設定を管理する
 * 
 * 主な機能：
 * 1. 設定管理
 *    - chrome.storage.localからの設定値取得
 *    - chrome.storage.localへの設定値保存
 *    - デフォルト値の提供
 * 
 * 2. UI制御
 *    - テキストエリアへの設定値表示
 *    - 保存ボタンのイベント処理
 *    - 保存完了の視覚的フィードバック
 * 
 * 3. 初期化処理
 *    - ページ読み込み時の設定読み込み
 *    - テキストエリアの初期化
 *    - イベントリスナーの設定
 * 
 */

/**
 * chrome.storage.localから設定値を取得する関数
 * 
 * 指定されたキーの設定値を取得し、存在しない場合はデフォルト値を返す
 * Promiseベースで非同期処理を行う
 * 
 * @param {string} key - 取得する設定のキー
 * @param {*} defaultValue - 設定が存在しない場合のデフォルト値
 * @returns {Promise<*>} 設定値またはデフォルト値
 * 
 */
function getStorageValue(key, defaultValue) {
	return new Promise((resolve) => {
		chrome.storage.local.get([key], function(result) {
			resolve(result[key] !== undefined ? result[key] : defaultValue);
		});
	});
}

/**
 * chrome.storage.localに設定値を保存する関数
 * 
 * 指定されたキーと値のペアをローカルストレージに保存する
 * Promiseベースで非同期処理を行う
 * 
 * @param {string} key - 保存する設定のキー
 * @param {*} value - 保存する値
 * @returns {Promise<void>} 保存完了を示すPromise
 * 
 */
function setStorageValue(key, value) {
	return new Promise((resolve) => {
		chrome.storage.local.set({[key]: value}, resolve);
	});
}

/**
 * 保存完了の視覚的フィードバックを表示する関数
 * 
 * 保存ボタンのテキストを一時的に「保存完了！」に変更し、
 * 2秒後に元のテキストに戻す。ユーザーに保存完了を明示する
 * 
 * @param {HTMLElement} saveButton - 保存ボタンの要素
 * @returns {void}
 * 
 */
function showSaveFeedback(saveButton) {
	// 保存完了メッセージ
	saveButton.textContent = '保存完了！';
	setTimeout(function() {
		saveButton.textContent = '設定を保存';
	}, 2000);
}

/**
 * ページ読み込み時の初期化処理
 * 
 * DOMContentLoadedイベントで実行され、以下の処理を行う
 * 1. 現在の設定値をローカルストレージから読み込み
 * 2. テキストエリアに設定値を表示
 * 3. 保存ボタンのイベントリスナーを設定
 * 
 * @returns {Promise<void>} 初期化完了を示すPromise
 * 
 */
document.addEventListener('DOMContentLoaded', async function() {
	// 現在の設定を読み込み
	var aiPromptTemplate = await getStorageValue('aiPromptTemplate', '以下のJavaScriptエラーを解析して修正方法を教えてください：\n\n{error}');
	
	// テキストエリアに設定値を表示
	var textarea = document.getElementById('aiPromptTemplate');
	textarea.value = aiPromptTemplate;
	
	// 保存ボタンのイベントリスナー
	var saveButton = document.getElementById('saveButton');
	saveButton.onclick = async function() {
		var newTemplate = textarea.value;
		await setStorageValue('aiPromptTemplate', newTemplate);
		
		// 保存完了の視覚的フィードバック
		showSaveFeedback(saveButton);
	};
});

