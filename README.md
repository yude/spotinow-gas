# Spotinow-GAS

Spotify の「現在再生中の曲」や「再生履歴」「Top Tracks / Artists」を表示するダッシュボードを Google Apps Script (GAS) 上に構築するプロジェクトです。
（[Spotify_NowPlaying](https://github.com/ao-ba/Spotify_NowPlaying) の GAS 移植版です。）

## 特徴
- サーバー不要：Google Apps Script だけで動作します。
- `html2canvas` を使用した画像の生成機能
- Top Tracks, Top Artists の集計表示機能

## セットアップ手順

1. **Spotify Developer Dashboard での準備**
   - [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) にアクセスし、アプリを作成します。
   - `Client ID` と `Client Secret` を控えておきます。
   - アプリ設定画面の `Redirect URIs` に、一時的に `https://script.google.com/macros/d/YOUR_SCRIPT_ID/usercallback` （GASのコールバックURL）を設定することになりますが、まずはGASのデプロイ後に取得できるWeb App URLを設定します。

2. **GAS プロジェクトへの反映**
   - リポジトリを clone し、依存関係をインストールします。
     ```bash
     npm install
     ```
   - Clasp でログインし、プロジェクトを作成または紐付けます。
     ```bash
     npx clasp login
     npx clasp create --type webapp --title "Spotinow" --rootDir ./src
     npx clasp push
     ```

3. **Script Properties の設定**
   - Apps Script のエディタ画面を開き、「プロジェクトの設定」 > 「スクリプト プロパティ」から以下を追加します。
     - `SPOTIFY_CLIENT_ID` : あなたの Client ID
     - `SPOTIFY_CLIENT_SECRET` : あなたの Client Secret

4. **Web アプリとしてのデプロイ**
   - 「デプロイ」 > 「新しいデプロイ」を選択。
   - 「種類の選択」で「ウェブアプリ」を選択。
   - 「アクセスできるユーザー」を「全員」にしてデプロイします。
   - 表示された「ウェブアプリのURL」をコピーし、Spotify Developer Dashboard の `Redirect URIs` に追加して保存します。

5. **初回認証**
   - WebアプリのURLにアクセスすると、初回認証（セットアップ）画面が表示されます。
   - 「Spotify で認証する」ボタンをクリックし、Spotify アカウントへのアクセスを許可します。
   - 完了すると、ダッシュボード画面が表示されます！

## セキュリティに関する注意
デフォルトの設定 (`appsscript.json` 内の `"access": "ANYONE_ANONYMOUS"`) では、WebアプリのURLを知っている人全員があなたの「再生中の曲」を閲覧できます。
自分だけが見られるようにしたい場合は、GASのデプロイ時の設定で「アクセスできるユーザー」を「自分のみ」に設定してください。
