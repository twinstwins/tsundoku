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
