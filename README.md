# Form Bookmark

テスト用にフォーム入力値を保存・復元するChrome拡張機能

## 機能

- 📑 フォーム入力値をブックマークとして保存
- ▶️ ワンクリックで保存した値を復元
- 🔄 ページ読み込み時に自動復元（オプション）
- 📁 フォルダで整理可能
- 🔒 パスワードフィールドはデフォルト除外（オプトインで保存可）
- 🌐 日本語/英語対応
- 📤 エクスポート/インポート機能
- ☁️ Chromeアカウントで同期

## 対応フィールド

- input (text, email, number, password*, etc.)
- select / select multiple
- textarea
- checkbox / radio

\* パスワードは「パスワードも保存する（テスト用）」オプションを有効にした場合のみ

## 特徴

- **URL単位で管理** - クエリパラメータを無視してURLごとにブックマークを整理
- **フレームワーク対応** - React/Vue等のSPAフレームワークでも正しく値を復元
- **クラウド同期** - Chromeにログインしていれば他デバイスとも自動同期

## インストール

### Chrome Web Store（推奨）
Chrome Web Store からインストール  
[Form Bookmark - Chrome Web Store](https://chromewebstore.google.com/detail/form-bookmark/fealbmcannacbkalmfajebicnajjnlki?authuser=0&hl=ja)

### 開発版
1. このリポジトリをクローン
   ```bash
   git clone https://github.com/atani/form-bookmark.git
   ```
2. Chrome で `chrome://extensions` を開く
3. 右上の「デベロッパーモード」を有効化
4. 「パッケージ化されていない拡張機能を読み込む」をクリック
5. クローンしたフォルダを選択

## 使い方

1. フォームがあるページで拡張機能アイコンをクリック
2. 「💾 現在のフォームを保存」ボタンをクリック
3. ブックマーク名を入力して保存
4. 復元したいときは保存したブックマークの ▶️ ボタンをクリック

## 設定

| 設定 | 説明 | デフォルト |
|------|------|------------|
| パスワードも保存する | パスワードフィールドも保存対象に含める | OFF |
| ページ読み込み時に自動復元 | URLが一致するブックマークがあれば自動で復元 | OFF |

## ストレージについて

- データは `chrome.storage.sync` に保存されます
- 容量上限: 100KB
- 90%以上使用時に警告が表示されます
- 上限に達した場合は不要なブックマークを削除してください

## サポート

[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-%E2%9D%A4-ea4aaa?logo=github)](https://github.com/sponsors/atani)

## ライセンス

MIT
