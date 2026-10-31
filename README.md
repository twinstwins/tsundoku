# Tsundoku

## ローカルで起動する

Docker DesktopとDocker Composeを使用します。既存アプリに合わせて、Ruby 2.5.1、Bundler 2.1.4、Node.js 10.24.1、MySQL 5.6を使用しています。Apple Siliconでも実行できるよう、Composeでは`linux/amd64`を指定しています。

初回はイメージをビルドし、データベースを作成してマイグレーションを実行します。

```sh
docker compose build
docker compose run --rm web bundle exec rails db:create db:migrate
docker compose up
```

ブラウザーで[http://localhost:3000](http://localhost:3000)を開き、ログイン画面からアカウントを新規登録できます。初期ユーザーの投入は不要です。

2回目以降の起動は`docker compose up`です。停止するには、実行中のターミナルでCtrl+Cを押します。

## テストを実行する

```sh
docker compose run --rm web bundle exec rspec
```

テストには`Tsundoku_test`データベースを使用します。

## E2Eテストを実行する

Playwrightの固定ブラウザー環境と、開発用とは別のDB・アプリコンテナで実行します。ホストPCにNode.jsやブラウザーを追加しなくても実行できます。

```sh
docker compose -f compose.e2e.yml up --build --abort-on-container-exit --exit-code-from e2e e2e
```

PCとモバイルのChromiumで、登録・ログイン・プロフィール・画像投稿・共有・いいね・コメント・フォローと、APIの認証・公開項目・CSRF・他人の更新拒否の12シナリオ（計24ケース）を実行します。テストごとにユーザーを生成し、特定のユーザーIDや前のテスト結果には依存しません。`http://localhost:43122`で確認用のアプリにアクセスできます。

HTMLレポートは`playwright-report/`、失敗時のトレース・画像・動画は`test-results/`に出力します。コマンドはテスト結果を終了コードで返します。再実行前や検証後は、専用環境を片付けます。

```sh
docker compose -f compose.e2e.yml down -v --remove-orphans
```

DBは一時メモリー上に置くため、DBコンテナの停止でテストデータが消えます。通常の`docker-compose.yml`や既存DBは使用しません。

特定のテストを実行する場合は、アプリだけ起動してからテストを指定できます。

```sh
docker compose -f compose.e2e.yml up -d --build web
docker compose -f compose.e2e.yml run --rm e2e sh -c 'npm ci && npm run test:e2e -- --project=chromium e2e/auth.spec.ts'
```

ホストで対話的に確認する場合はNode.js 24を使用します。

```sh
npm ci
npx playwright install chromium
npm run test:e2e:ui
```

GitHub Actionsの`E2E`ワークフローは、専用DBでのRSpec・API型の生成漏れ検査・TypeScriptの型チェック・E2EをPRごとに実行し、診断用ファイルを7日間保存します。ブラウザーでの操作は実際のRailsとMySQLに接続し、APIの成功応答を置き換える処理は使いません。

読み取りAPIの公開範囲、セッションとCSRF、OpenAPIからの型生成は[APIの利用手順](docs/api/v1/README.md)を参照してください。

React・TypeScript・Viteへの移行順序と完了条件は[フロントエンド移行計画](docs/frontend-modernization.md)を参照してください。
