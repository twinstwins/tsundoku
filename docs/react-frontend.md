# Reactフロントの起動・切替・検証

ユーザー一覧（`/`と`/users`）とログイン済みの投稿詳細（`/contents/:id`）をReactへ移行した。React 19.3.1、TypeScript 7.0.2、Vite 8.3.5、TanStack Query 5.105.0を使用する。画面の依存は`frontend/`で固定し、Railsの認証・URL・更新処理を引き継ぐ。

## ビルド済みの画面へ切り替える

設定は画面単位で独立し、どちらも既定値は`0`。`1`で新画面を有効にする。

| 設定 | 対象 |
| --- | --- |
| `REACT_USERS_ENABLED` | 公開ユーザー一覧 |
| `REACT_CONTENT_DETAIL_ENABLED` | ログイン済みの投稿詳細。未ログイン時は従来の公開ERBを継続 |

通常のアプリ用Dockerイメージは、独立したNode.js 24.22.1の工程で型を検査してViteをビルドし、生成した`public/frontend/`をRailsへコピーする。Ruby側のNode.js 10は既存Sprockets用として残る。

ソースをバインドマウントしない本番用コンテナでは、ビルド後に必要な画面の設定を`1`として起動する。既存のSprocketsのprecompileと静的ファイル配信の設定も継続し、Webサーバーから`/frontend/`を配信する。Railsが配信する構成では`RAILS_SERVE_STATIC_FILES=1`を設定する。

通常の開発Composeはリポジトリ全体をマウントするため、イメージ内のビルド成果物がホスト側に隠れる。ビルド済み画面を開発Composeで確認する場合は、Node.js 24で次を実行してから起動する。

```sh
npm --prefix frontend ci
npm --prefix frontend run build
REACT_USERS_ENABLED=1 REACT_CONTENT_DETAIL_ENABLED=1 docker compose up --build
```

ホストにNode.js 24を入れずにビルドする場合は、同じ作業をNodeコンテナで実行できる。

```sh
docker run --rm -v "$PWD:/workdir" -w /workdir/frontend node:24.22.1-bookworm-slim sh -c 'npm ci --no-fund && npm run build'
REACT_USERS_ENABLED=1 REACT_CONTENT_DETAIL_ENABLED=1 docker compose up --build
```

切り戻しは対象画面の設定を`0`としてRailsのプロセスを再起動する。例えば`REACT_CONTENT_DETAIL_ENABLED=0`で投稿詳細だけを戻せる。DBの変更は不要。指定したmanifest、entry、共有chunk、CSSのいずれかが壊れている／存在しない場合も、Railsは既存のERB画面を返す。原因はRailsログに記録する。

本番更新時はmanifestを最後に切り替え、旧hash付きJS・CSSを移行期間中の静的ファイル配信先にも残す。Dockerイメージは新しい成果物を含むため、複数リリースのファイル保持は配信側で行う。成果物に欠けがある場合にアプリを停止させる構成にはしない。

## 開発時の画面更新

READMEの初回DB作成を済ませ、次の組合せで起動する。

```sh
docker compose -f docker-compose.yml -f compose.frontend-dev.yml up --build
```

[http://localhost:3000](http://localhost:3000)を開く。Node.js 24の別コンテナがViteを起動し、RailsのHTMLにReact Refreshの初期化と開発用のmoduleを読み込む。APIへの通信はRailsと同じオリジンを使う。開発サーバーのCORS許可は`RAILS_ORIGIN`の1オリジンに限定する。

この開発用の組合せは両画面を既定で有効にする。個別に従来画面へ戻す場合は、例えば`REACT_CONTENT_DETAIL_ENABLED=0`を付けて起動する。

`127.0.0.1:3000`で開く場合は`RAILS_ORIGIN=http://127.0.0.1:3000`を指定する。Docker Desktopで変更が検出されない場合は`VITE_USE_POLLING=1`を指定できる。`VITE_DEV_SERVER_URL`の既定値は`http://localhost:5173`。この設定はdevelopment環境だけで使い、production環境では使わない。

## RailsとReactの境界

RailsがページURLを扱い、Reactは`data-react-page="users"`または`data-react-page="content"`の内側を描画する。共通entryは`src/entrypoints/application.tsx`。いずれかの画面を有効にすると同じentryを既存画面にも読み込み、Turbolinksで画面を切り替える。CSS Modulesで新しいスタイルを限定し、Bootstrapのリセットを変更しない。

一覧は`GET /api/v1/users`からIDの降順で20人ずつ取得する。生成済みのAPI型を使い、ページ送りは同じRails URLの`page`パラメーターで表す。空一覧、範囲外のページ、画像未登録・画像取得失敗、通信失敗と再試行を扱う。

投稿詳細はログイン済みのときだけ`GET /api/v1/contents/:id`を使い、APIの認証条件を維持する。未ログインでのHTML閲覧は従来どおり公開ERBとなる。投稿名、改行を保った説明、作成者、投稿日時、サムネイル、いいね・コメント数、本人のいいね状態を表示する。画像なし・画像読込失敗・旧データの空の投稿名にも対応する。更新操作は既存の投稿一覧にリンクする。

APIの通信失敗は再試行、404は対象がないこと、401は再ログインの案内を表示する。ログインリンクに`return_to=/contents/:id`を付け、Deviseのセッション内に戻り先を保存する。戻り先は正の整数IDを持つ投稿パスだけを許可し、外部URL・別画面・クエリー付きURLは受け付けない。投稿HTMLとAPIは`no-store`を返す。直接アクセスで対象がない場合は、RailsがHTTP 404と「投稿が見つかりません」のHTML画面を返す。本文が空の404応答でFirefoxが読み込み完了を待ち続けるケースも、この画面で確認する。JSONを要求した場合のエラー形式は維持する。

有効時は既存画面にも同じentryを読み込み、Turbolinksの画面移動で二重にReactを作らない。キャッシュ保存・画面差替え前にはReactを破棄し、進行中の取得とQueryキャッシュを片付ける。戻る操作では新しいデータを取得する。React内にRails UJSの`data-remote`は置かない。

manifestの共有依存をたどり、CSSを依存順に重複なく読み、JSの共有chunkをmodulepreloadする。実装は[FrontendAssets](../app/services/frontend_assets.rb)、[Railsのタグ生成](../app/helpers/frontend_helper.rb)、[Reactの起動と後片付け](../frontend/src/bootstrap.tsx)に分ける。[Viteのバックエンド連携](https://vite.dev/guide/backend-integration)、[Reactのroot管理](https://react.dev/reference/react-dom/client/createRoot)、[Turbolinksのイベント](https://github.com/turbolinks/turbolinks#observing-navigation-events)に基づく。

## テスト

部品・取得失敗・ライフサイクルはVitestとReact Testing Libraryで確認する。

```sh
npm --prefix frontend ci
npm --prefix frontend run typecheck
npm --prefix frontend test
npm --prefix frontend run build
```

専用DB・コンテナで本番用のRails設定、Sprocketsのprecompile、Vite成果物を使って新旧両画面を確認する。

```sh
REACT_USERS_ENABLED=1 REACT_CONTENT_DETAIL_ENABLED=1 E2E_RAILS_ENV=production CI=true docker compose -f compose.e2e.yml up --build --abort-on-container-exit --exit-code-from e2e e2e
docker compose -f compose.e2e.yml down -v --remove-orphans
REACT_USERS_ENABLED=0 REACT_CONTENT_DETAIL_ENABLED=0 E2E_RAILS_ENV=production CI=true docker compose -f compose.e2e.yml up --build --abort-on-container-exit --exit-code-from e2e e2e
docker compose -f compose.e2e.yml down -v --remove-orphans
```

PC・モバイルChromiumで、両画面有効時は44件、両画面無効時は32件。既存の24件に加え、プロフィールからの戻る操作・再読込・通信失敗からの復帰・ページ送り、投稿詳細の画像表示・ゲスト閲覧・404・再ログイン後の復帰・いいね操作後の再取得を確認する。成功応答は実際のRailsを使い、投稿APIの401・404もCookie削除と存在しないIDへの転送により実際の応答を検証する。ページ送りの準備用ユーザー20人は、個別のCookieと実際のCSRFトークンを使って登録先へ送信し、最後の1人は画面で登録する。HTMLのviewport指定も検査し、実際の端末幅で横にはみ出さないことを確認する。

開発時のHMRとReact Refreshは、元のソースを変更しないコピーと別の専用環境で確認する。

```sh
node tools/prepare-frontend-dev.mjs
E2E_PORT=43123 CI=true docker compose -f compose.e2e.yml -f compose.frontend-dev-test.yml up --abort-on-container-exit --exit-code-from e2e e2e
docker compose -f compose.e2e.yml -f compose.frontend-dev-test.yml down -v --remove-orphans
```

ブラウザーで画像取得を失敗させ、コンポーネントの表示を変更しても、画像エラーの状態と同じHTML文書が保持されることをPCとモバイルで確認する。その後、Vite経由の投稿詳細へ移動して画像まで表示できることも確認する。

`E2E`ワークフローは両画面の新旧設定と開発時更新をPRごとに確認する。設定の独立性と成果物欠落時の切り戻しはRSpecで確認する。`Browser compatibility`は毎週土曜6時（日本時間）と手動実行でFirefox・WebKitを含む4構成、計88件を検証する。定期実行の設定を変更したPRでも起動する。各種ログ・トレース・レポートは7日間保存する。
