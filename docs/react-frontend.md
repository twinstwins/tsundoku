# Reactフロントの起動・切替・検証

ユーザー一覧（`/`と`/users`）、ログイン済みの投稿詳細（`/contents/:id`）、公開プロフィール（`/users/:id`）をReactへ移行した。React 19.3.1、TypeScript 7.0.2、Vite 8.3.5、TanStack Query 5.105.0を使用する。画面の依存は`frontend/`で固定し、Railsの認証・URLを引き継ぎ、いいね・コメント・フォローをJSON APIで更新する。

## ビルド済みの画面へ切り替える

設定は画面単位で独立し、すべて既定値は`0`。`1`で新画面を有効にする。

| 設定 | 対象 |
| --- | --- |
| `REACT_USERS_ENABLED` | 公開ユーザー一覧 |
| `REACT_CONTENT_DETAIL_ENABLED` | ログイン済みの投稿詳細。未ログイン時は従来の公開ERBを継続 |
| `REACT_PROFILE_ENABLED` | 公開プロフィールの名前・アバター・投稿。本人の編集導線はRails側に残す |
| `REACT_LIKES_ENABLED` | Reactの投稿詳細からいいねを操作。`REACT_CONTENT_DETAIL_ENABLED=1`も必要 |
| `REACT_COMMENTS_ENABLED` | Reactの投稿詳細でコメントの一覧・作成・本人による削除。`REACT_CONTENT_DETAIL_ENABLED=1`も必要 |
| `REACT_FOLLOWS_ENABLED` | Reactのプロフィールからフォロー・解除。`REACT_PROFILE_ENABLED=1`も必要 |

通常のアプリ用Dockerイメージは、独立したNode.js 24.22.1の工程で型を検査してViteをビルドし、生成した`public/frontend/`をRailsへコピーする。Dockerの転送対象から入れ子の`node_modules`も除外し、ホスト側の依存やテストキャッシュを持ち込まない。Ruby側のNode.js 10は既存Sprockets用として残る。

ソースをバインドマウントしない本番用コンテナでは、ビルド後に必要な画面の設定を`1`として起動する。既存のSprocketsのprecompileと静的ファイル配信の設定も継続し、Webサーバーから`/frontend/`を配信する。Railsが配信する構成では`RAILS_SERVE_STATIC_FILES=1`を設定する。

通常の開発Composeはリポジトリ全体をマウントするため、イメージ内のビルド成果物がホスト側に隠れる。ビルド済み画面を開発Composeで確認する場合は、Node.js 24で次を実行してから起動する。

```sh
npm --prefix frontend ci
npm --prefix frontend run build
REACT_USERS_ENABLED=1 REACT_CONTENT_DETAIL_ENABLED=1 REACT_PROFILE_ENABLED=1 REACT_LIKES_ENABLED=1 REACT_COMMENTS_ENABLED=1 REACT_FOLLOWS_ENABLED=1 docker compose up --build
```

ホストにNode.js 24を入れずにビルドする場合は、同じ作業をNodeコンテナで実行できる。

```sh
docker run --rm -v "$PWD:/workdir" -w /workdir/frontend node:24.22.1-bookworm-slim sh -c 'npm ci --no-fund && npm run build'
REACT_USERS_ENABLED=1 REACT_CONTENT_DETAIL_ENABLED=1 REACT_PROFILE_ENABLED=1 REACT_LIKES_ENABLED=1 REACT_COMMENTS_ENABLED=1 REACT_FOLLOWS_ENABLED=1 docker compose up --build
```

切り戻しは対象画面の設定を`0`としてRailsのプロセスを再起動する。例えば`REACT_CONTENT_DETAIL_ENABLED=0`で投稿詳細だけを戻せる。DBの変更は不要。指定したmanifest、entry、共有chunk、CSSのいずれかが壊れている／存在しない場合も、Railsは既存のERB画面を返す。原因はRailsログに記録する。

本番更新時はmanifestを最後に切り替え、旧hash付きJS・CSSを移行期間中の静的ファイル配信先にも残す。Dockerイメージは新しい成果物を含むため、複数リリースのファイル保持は配信側で行う。成果物に欠けがある場合にアプリを停止させる構成にはしない。

## 開発時の画面更新

READMEの初回DB作成を済ませ、次の組合せで起動する。

```sh
docker compose -f docker-compose.yml -f compose.frontend-dev.yml up --build
```

[http://localhost:3000](http://localhost:3000)を開く。Node.js 24の別コンテナがViteを起動し、RailsのHTMLにReact Refreshの初期化と開発用のmoduleを読み込む。APIへの通信はRailsと同じオリジンを使う。開発サーバーのCORS許可は`RAILS_ORIGIN`の1オリジンに限定する。

この開発用の組合せは3画面を既定で有効にする。個別に従来画面へ戻す場合は、例えば`REACT_PROFILE_ENABLED=0`を付けて起動する。

開発用の組合せではいいね・コメント・フォローも既定で有効にする。フォローだけ戻す場合は`REACT_FOLLOWS_ENABLED=0`を指定する。コメントだけ戻す場合は`REACT_COMMENTS_ENABLED=0`を指定する。`REACT_LIKES_ENABLED=0`で、React詳細の閲覧を保ったまま、いいねを既存一覧で操作する状態に戻せる。DBの変更は不要。

`127.0.0.1:3000`で開く場合は`RAILS_ORIGIN=http://127.0.0.1:3000`を指定する。Docker Desktopで変更が検出されない場合は`VITE_USE_POLLING=1`を指定できる。`VITE_DEV_SERVER_URL`の既定値は`http://localhost:5173`。この設定はdevelopment環境だけで使い、production環境では使わない。

## RailsとReactの境界

RailsがページURLを扱い、Reactは`data-react-page`で指定した領域の内側を描画する。ユーザー一覧は`users`、投稿詳細は`content`、プロフィールは`profile`と`profile-posts`。共通entryは`src/entrypoints/application.tsx`。いずれかの画面を有効にすると同じentryを既存画面にも読み込み、Turbolinksで画面を切り替える。CSS Modulesで新しいスタイルを限定し、Bootstrapのリセットを変更しない。

一覧は`GET /api/v1/users`からIDの降順で20人ずつ取得する。生成済みのAPI型を使い、ページ送りは同じRails URLの`page`パラメーターで表す。空一覧、範囲外のページ、画像未登録・画像取得失敗、通信失敗と再試行を扱う。

プロフィールは公開APIの`GET /api/v1/users/:id`と`GET /api/v1/users/:id/contents`を使う。後者はその人の投稿だけをID降順で20件ずつ返し、`/users/:id?page=2`のようにページを表す。公開項目だけを取得し、本人のメール・編集リンクはRailsが本人にだけ返す。名前と投稿を別のReact領域にする。フォロー有効時は名前の領域内で件数と操作をReactが管理し、本人のメール・編集導線は領域の外に残す。無効時は従来の件数・Rails UJSのフォロー操作を領域の外に返す。既存Rails UJSによる更新先をReactの内側へ置かず、両方のReact領域を移動時に破棄して未完了の要求も中断する。

従来画面でも他人のメールと編集リンクを表示しない。投稿数の表示と画像なし投稿からの詳細リンクも修正した。プロフィールHTMLは`no-store`と`turbolinks-cache-control=no-cache`を使い、戻る際の本人向け情報とフォロー状態をサーバーで確認し直す。[Turbolinksのキャッシュ制御](https://github.com/turbolinks/turbolinks#opting-out-of-caching)

投稿詳細はログイン済みのときだけ`GET /api/v1/contents/:id`を使い、APIの認証条件を維持する。未ログインでのHTML閲覧は従来どおり公開ERBとなる。投稿名、改行を保った説明、作成者、投稿日時、サムネイル、いいね・コメント数、本人のいいね状態を表示する。画像なし・画像読込失敗・旧データの空の投稿名にも対応する。無効にした更新操作は既存の投稿一覧にリンクする。

いいね操作を有効にすると、`GET /api/v1/me`でCSRFトークンを取得してから`PUT`または`DELETE /api/v1/contents/:id/like`を送る。送信中はボタンを無効にし、件数を先に増減させず、サーバーの応答を反映する。書き込みは自動再試行せず、オフラインの要求を再接続後へ保留しない。[TanStack QueryのMutation](https://tanstack.com/query/latest/docs/framework/react/guides/mutations)

通信断の後はGETで現在の状態を確認する。確定済みなら表示を揃え、未反映なら同じ意図の再試行を案内する。GETも失敗した場合は新しい書き込みを止め、「状態を確認」でGETだけを送る。401・404は投稿詳細のログイン復帰・削除済み表示へつなぐ。ログイン後に古い操作を自動再送しない。画面を離れると未完了の要求を中断するが、サーバーで確定済みの更新は取り消さず、次回の取得で確認する。

コメントは`GET /api/v1/contents/:id/comments`をID降順で20件ずつ取得する。ページはReact内のボタンで切り替え、下書きを保持する。再読込・画面移動では最初のページから取得する。`current_user_comment`をページとは独立して返し、本人のコメントが別ページにあっても表示・削除できる。本文はHTMLとして解釈せず、改行を保って表示する。

作成は`POST /api/v1/contents/:id/comments`、削除は`DELETE /api/v1/contents/:id/comments/:comment_id`。1ユーザー・1投稿につき1件を維持し、空欄と重複を拒否する。既存コメントの上書きはしない。送信前にCSRFトークンを取得し、連打と自動再送を防ぐ。成功後はコメント一覧・本人の状態・投稿詳細の件数を実際のGETで揃える。

通信断の後もGETで確認し、保存済みの本文または削除済みのIDを確認してから完了を表示する。未反映なら同じ本文・IDの手動再試行を案内する。確認も失敗した場合はGETのみの確認を案内し、新しい書き込みを止める。検証エラー・通信失敗・ページ送りで下書きを保持する。別画面で先にコメントが作られた場合は、その内容と下書きを表示して上書きを防ぐ。

結果確認中に下書きを編集した場合、保存済みの旧本文を確認しても新しい下書きを消さない。旧本文が未保存なら、編集後の入力内容を確認して新しく投稿するよう案内する。

コメントの401では下書きをコピーできる状態でログインを案内する。下書きはメモリーだけに置き、画面移動・再読込・ログイン時には失われる。ログイン後は本人が再入力して送信する。404はコメント欄で投稿が見つからないことを案内し、操作を止める。画面を離れた際は未完了の要求を中断する。

APIの通信失敗は再試行、404は対象がないこと、401は再ログインの案内を表示する。ログインリンクに`return_to=/contents/:id`を付け、Deviseのセッション内に戻り先を保存する。戻り先は正の整数IDを持つ投稿・プロフィールのパスだけを許可し、外部URL・編集などの別画面・クエリー付きURLは受け付けない。投稿HTMLとAPIは`no-store`を返す。直接アクセスで対象がない場合は、RailsがHTTP 404と「投稿が見つかりません」のHTML画面を返す。本文が空の404応答でFirefoxが読み込み完了を待ち続けるケースも、この画面で確認する。JSONを要求した場合のエラー形式は維持する。

フォロー有効時は公開プロフィールに加え、`GET /api/v1/users/:id/follow`で本人の状態を取得する。このAPIはログイン必須で、公開ユーザーAPIに閲覧者別の項目を混ぜない。ゲストも公開プロフィール・投稿・件数を閲覧でき、ログインへのリンクを表示する。自分のプロフィールにはフォローボタンを表示しない。

フォローと解除は同じURLへのPUT・DELETEで、状態を反転させる操作にはしない。毎回`GET /api/v1/me`でCSRFを取得する。送信中は連打を止め、件数はサーバーの応答で更新する。通信断後はGETで実状態を確認し、未反映なら同じ意図を手動で再試行できる。確認も失敗したら新しい書き込みを止め、GETだけの確認を案内する。自動再送やオフライン要求の保留、再ログイン後の自動送信は行わない。

401ではログインして同じプロフィールへ戻るリンクを表示する。404では相手が存在しないことを案内する。フォロー状態の取得失敗でも公開プロフィールと投稿は表示を続け、状態だけを再取得できる。フォロー・フォロワー一覧は既存のRails URLへリンクする。両一覧も`no-store`と`turbolinks-cache-control=no-cache`を返し、フォロー変更後の戻る操作でも古い一覧を復元せず、新しい状態を取得する。

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
REACT_USERS_ENABLED=1 REACT_CONTENT_DETAIL_ENABLED=1 REACT_PROFILE_ENABLED=1 REACT_LIKES_ENABLED=1 REACT_COMMENTS_ENABLED=1 REACT_FOLLOWS_ENABLED=1 E2E_RAILS_ENV=production CI=true docker compose -f compose.e2e.yml up --build --abort-on-container-exit --exit-code-from e2e e2e
docker compose -f compose.e2e.yml down -v --remove-orphans
REACT_USERS_ENABLED=0 REACT_CONTENT_DETAIL_ENABLED=0 REACT_PROFILE_ENABLED=0 REACT_LIKES_ENABLED=0 REACT_COMMENTS_ENABLED=0 REACT_FOLLOWS_ENABLED=0 E2E_RAILS_ENV=production CI=true docker compose -f compose.e2e.yml up --build --abort-on-container-exit --exit-code-from e2e e2e
docker compose -f compose.e2e.yml down -v --remove-orphans
```

PC・モバイルChromiumで、3画面・いいね・コメント・フォローの有効時は102件、すべて無効時は50件。既存操作に加え、一覧・詳細・プロフィールの表示と復帰、いいねの連打・既存処理との同時送信・通信断・CSRF拒否・再接続・再ログインを確認する。コメントの下書き・21件のページ送り・別ページの本人の削除・既存処理との競合も確認する。応答消失の検証でも先に実際の更新要求をRailsへ送り、確定後にブラウザーへの応答を中断する。フォローの自分自身への要求拒否、他人・逆方向・別対象の関連の保持、公開閲覧、ログイン復帰、新旧処理との整合も確認する。成功応答を作り物に置き換えない。

ユーザー一覧の準備用20人は個別CookieとCSRFトークンで登録する。プロフィールのページ送り用20投稿は本人のCookieとCSRFトークンで既存の投稿先へ送信し、最後の1件は画面で投稿する。専用のテスト用APIは追加しない。HTMLのviewport指定も検査し、実際の端末幅で横にはみ出さないことを確認する。

開発時のHMRとReact Refreshは、元のソースを変更しないコピーと別の専用環境で確認する。

```sh
node tools/prepare-frontend-dev.mjs
E2E_PORT=43123 CI=true docker compose -f compose.e2e.yml -f compose.frontend-dev-test.yml up --abort-on-container-exit --exit-code-from e2e e2e
docker compose -f compose.e2e.yml -f compose.frontend-dev-test.yml down -v --remove-orphans
```

ブラウザーで画像取得を失敗させ、コンポーネントの表示を変更しても、画像エラーの状態と同じHTML文書が保持されることをPCとモバイルで確認する。その後、Vite経由の投稿詳細でいいねとコメントを操作し、プロフィールまで表示し、別のユーザーのフォローも操作できることを確認する。

`E2E`ワークフローは3画面・いいね・コメント・フォローの新旧設定、開発時更新をPRごとに確認する。設定の独立性と成果物欠落時の切り戻しはRSpecで確認する。`Browser compatibility`は毎週土曜6時（日本時間）と手動実行でFirefox・WebKitを含む4構成、計204件を検証する。定期実行の設定を変更したPRでも起動する。各種ログ・トレース・レポートは7日間保存する。
