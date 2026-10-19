// アプリのバージョンと更新日時（更新のたびに書き換える）。画面表示と Service Worker のキャッシュ名に使う
// history … ホームの「更新履歴」に出す内容（新しい順、最新3件だけ残す）
self.DRACUT_VERSION = {
  ver: '1.31',
  updated: '2026/10/19 22:48',
  history: [
    { ver: '1.31', date: '2026/10/19', text: '応援リンク（Buy Me a Coffee・T-DRAGONのSNS）を追加' },
    { ver: '1.30', date: '2026/10/19', text: 'ホームの説明文を変更' },
    { ver: '1.29', date: '2026/10/19', text: 'ホームの説明から「AIも使いません」を削除' },
  ],
};
