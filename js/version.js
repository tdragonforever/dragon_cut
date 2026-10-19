// アプリのバージョンと更新日時（更新のたびに書き換える）。画面表示と Service Worker のキャッシュ名に使う
// history … ホームの「更新履歴」に出す内容（新しい順、最新3件だけ残す）
self.DRACUT_VERSION = {
  ver: '1.43',
  updated: '2026/10/20 00:12',
  history: [
    { ver: '1.43', date: '2026/10/19', text: '選んだときのボタンの並びに「null」と表示される不具合を修正' },
    { ver: '1.42', date: '2026/10/19', text: 'ホーム画面に追加する方法（iPhone）の表記を Safari に戻す' },
    { ver: '1.41', date: '2026/10/19', text: '文言を「スマホ」「Safari/Chrome」に統一。書き出し完了画面の応援を T-DRAGON に' },
  ],
};
