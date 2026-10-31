# API v1

Reactへの段階移行で使う、Railsと同じオリジンのJSON API。仕様の正本は[openapi.json](openapi.json)、生成したTypeScript型は[`types/api-v1`](../../../types/api-v1)に置く。読み取りに加えて、本人の投稿を作成し、いいね・コメント・フォローを更新するAPIを提供する。

| GETのパス | 認証 | 内容 |
| --- | --- | --- |
| `/api/v1/users` | 不要 | 公開ユーザー一覧 |
| `/api/v1/users/{id}` | 不要 | 名前・アバターと投稿・フォロー数 |
| `/api/v1/users/{id}/contents` | 不要 | 公開プロフィールの投稿・画像。指定した作成者だけをページング |
| `/api/v1/users/{id}/following` | 不要 | フォローしているユーザー一覧 |
| `/api/v1/users/{id}/followers` | 不要 | フォロワー一覧 |
| `/api/v1/me` | 必要 | ログイン本人の名前・メール・CSRFトークン |
| `/api/v1/contents` | 必要 | 投稿一覧。`feed=all`（既定）または`feed=following` |
| `/api/v1/contents/{id}` | 必要 | 投稿・画像・作成者・いいね数・コメント数・本人のいいね状態 |
| `/api/v1/contents/{content_id}/comments` | 必要 | コメント一覧とページとは独立した本人のコメント |
| `/api/v1/users/{user_id}/follow` | 必要 | 相手の件数と本人からのフォロー状態。自分のプロフィールかも区別 |
| `/api/v1/content-submissions/{submission_key}` | 必要 | 本人の送信識別子から保存済み投稿を確認 |

公開ユーザー情報は既存の公開ユーザー一覧と同じ範囲とし、メールは含めない。投稿一覧のfollowingには本人の投稿を含めず、フォロー先の投稿だけを返す。すべての応答に`Cache-Control: no-store`を付ける。

プロフィールの投稿APIは、従来の公開プロフィールに表示していた投稿だけを返す。項目は`id`、`name`、`description`、`created_at`、`photos`に限定する。メール・CSRFトークン・閲覧者別のいいね状態は含めない。存在しないユーザーは404、投稿がないユーザーは空配列と件数0を返す。`/api/v1/contents`とその詳細のログイン必須は継続する。

## 応答とエラー

成功応答は`{"data": ...}`。一覧には`meta`（`page`、`per_page`、`total_count`、`total_pages`）が付く。IDの降順で、`page`は1〜1,000,000、`per_page`は1〜100（既定20）。範囲外・不正な値は422、末尾以降のページは空の配列を返す。日時はUTCのISO 8601、未登録の画像URLはnullとする。新しい投稿名は必須だが、旧データにある空文字の投稿名はそのまま読み取れる。

```json
{
  "error": {
    "code": "validation_error",
    "message": "入力内容を確認してください",
    "fields": { "name": ["can't be blank"] }
  }
}
```

未認証は401（`unauthenticated`）、存在しない対象は404（`not_found`）、入力不正は422（`validation_error`）。既存の更新ルートもJSONを要求した場合はこのエラー形式を使い、本文の不足は400（`invalid_request`）、CSRF不正は422（`invalid_csrf_token`）、一意制約の競合は409（`conflict`）を返す。項目名を`fields`のキーとし、エラー文言は表示用として扱う。対象が他人のレコードの場合も404とする。

## セッションとCSRF

DeviseのセッションCookieを引き継ぐ。同じオリジンから`fetch`し、APIの401を受けた画面がログインと復帰先を扱う。APIはログイン画面へリダイレクトしない。

更新操作では`GET /api/v1/me`の`data.csrf_token`を`X-CSRF-Token`ヘッダーに付ける。ログイン・ログアウトなどでセッションが変わった後は取得し直す。CSRF保護を無効化しない。投稿作成・いいね・コメント・フォローAPIはJSON/no-storeを設定し、認証を確認してからCSRFを検証する。ゲストは401、ログイン済みでトークンが不正なら422となる。

## いいね状態の更新

| メソッドとパス | 意味 |
| --- | --- |
| `PUT /api/v1/contents/{content_id}/like` | 本人のいいねを登録済みにする |
| `DELETE /api/v1/contents/{content_id}/like` | 本人のいいねを解除済みにする |

本文は不要。作成者はセッション、投稿はURLから決め、本文の`user_id`・`content_id`・like IDは使わない。同じ要求を繰り返しても重複登録や状態の反転を起こさない。成功時は200で次の状態を返す。

```json
{"data":{"content_id":1,"likes_count":3,"liked_by_current_user":true}}
```

既存一覧のRails UJSによるいいねも継続する。新旧双方の書き込みを同じ投稿行の`with_lock`内で実行し、同時要求でも新しい重複を作らない。既存の重複レコードがあってもPUTでは増やさず、DELETEは本人のその投稿へのいいねだけをすべて解除する。他人のいいねや別の投稿には触れない。DBの一括修正やスキーマ変更は行わない。[Railsの行ロック](https://api.rubyonrails.org/v5.2.8/classes/ActiveRecord/Locking/Pessimistic.html)

フロントは送信前にCSRFトークンを取得し、送信中は操作を無効にする。書き込みは自動再試行しない。通信断の後は投稿GETで現在の状態を確認し、すでに反映済みなら表示を合わせる。未反映なら同じ意図を明示的に再試行でき、確認自体が失敗した場合は新しい書き込みを止めてGETのみの確認を案内する。

既存更新処理では、プロフィールの簡易フォームを本人の名前・アバターに限定する。メールとパスワードの変更は、現在のパスワードを検証するDeviseのフォームを使う。コメントの作成者はセッションから、コメント・いいねの投稿はURLから決定し、削除は本人の関連から検索する。

## コメントの一覧・作成・削除

| メソッドとパス | 意味 |
| --- | --- |
| `GET /api/v1/contents/{content_id}/comments` | ID降順のコメントとページ情報。既定20件、最大100件 |
| `POST /api/v1/contents/{content_id}/comments` | 本人のコメントを作成。本文は`{"comment":{"comment":"感想"}}` |
| `DELETE /api/v1/contents/{content_id}/comments/{id}` | URLの投稿にある本人の指定コメントだけを削除 |

コメントは`id`、`content_id`、`comment`、`created_at`、公開`user`、`owned_by_current_user`を返す。GETは`data`配列と`meta`に加え、本人のコメントを`current_user_comment`として返す。現在のページに含まれなくても取得でき、未投稿ならnull。旧データに本人の重複がある場合は最も古い1件を示す。メール・CSRFトークンは含めない。

POSTの成功は201で`{data: コメント, comments_count: 件数}`、DELETEは200で`{data: {id, content_id, comments_count}}`。本文のリソース不足・不正は400、空欄・文字列以外・重複は422。1ユーザー・1投稿につき1件を維持し、作成者はセッション、投稿はURLから決める。送られた作成者IDや別の投稿IDは使わず、既存コメントを上書きしない。

新APIと従来Rails UJSの作成・削除を同じ投稿行のロック内で行い、同時作成でも新しい重複を防ぐ。他人・別投稿・削除済みIDへのDELETEは404。既存の重複を一括修正せず、削除する本人の指定した1件だけを消す。既存画面からの空欄・重複も引き続き422となる。

フロントではCSRFを毎回取得し、自動再送・オフライン要求の保留を行わない。失敗時はGETで本人のコメントを確認する。同じ本文が保存済み、または指定IDが削除済みなら反映する。未反映なら同じ意図の手動再試行を案内し、確認自体も失敗した場合はGETだけで確認する。別内容が先に保存されていれば既存コメントと下書きを保持する。下書きはメモリーだけに置き、ログインのため画面を離れる前にはコピーを案内する。

## フォロー状態の取得・更新

| メソッドとパス | 意味 |
| --- | --- |
| `GET /api/v1/users/{user_id}/follow` | 本人から相手への状態と、相手のフォロー・フォロワー数 |
| `PUT /api/v1/users/{user_id}/follow` | 本人から相手へのフォローを登録済みにする |
| `DELETE /api/v1/users/{user_id}/follow` | 本人から相手へのフォローを解除済みにする |

全メソッドでログイン必須。更新にはCSRFを付け、本文は不要。実行者はセッション、相手はURLから決め、本文の`follower_id`・`following_id`・`user_id`・relationship IDを使わない。自分へのPUT・DELETEは422、対象なしは404。APIは常にJSON/no-storeを返す。

成功は200で`{data: {user_id, following_count, followers_count, followed_by_current_user, is_current_user}}`。件数は閲覧対象のユーザーの値で、GETでは自分のプロフィールも取得できる。公開プロフィールAPIには閲覧者別の状態を追加せず、メール・CSRFも含めない。ゲストの公開プロフィール閲覧は継続する。

PUT・DELETEは繰り返しでも状態を反転しない。DELETEは本人からURLの相手への関連だけを解除し、他人・逆方向・別対象のフォローを保持する。既存DBの組合せ一意制約を維持し、新APIと既存Rails UJSの書き込みを対象ユーザー行のロック内で処理する。既存POSTの重複・自分へのフォローは422、他人のrelationship IDへの削除は404を継続する。スキーマや既存データの変更は不要。

フロントは毎回CSRFを取得し、送信中の連打・自動再試行・オフライン要求の保留を行わない。応答消失時はGETで実状態を確認し、反映済みなら表示を揃え、未反映なら同じ意図の手動再試行を案内する。確認も失敗した場合はGETのみで確認する。401ではログインして同じプロフィールへ戻り、古い操作を自動送信しない。

## 投稿の作成と送信結果の確認

先に`20261031000000`のDBマイグレーションを適用する。既存投稿のNULLキーは保持し、`user_id`と`submission_key`で同じ利用者の送信を一意にする。既存のHTML投稿・共有は従来どおり使える。

`POST /api/v1/contents`はログイン必須で、`X-CSRF-Token`と小文字UUID v4の`Idempotency-Key`を付ける。本文はJSONの`{content: {name, description}}`、またはmultipartの`content[name]`・`content[description]`・`content[image]`。実行者はセッションから決め、送られた`user_id`・送信識別子の本文・画像URL・既存写真IDは使わない。

名前は空欄不可・255文字まで。説明は任意、65,535バイトまで。現在のDBの文字設定に合わせ、4バイト文字は項目別422とする。任意の1画像はJPEG・PNG・GIF、5MiB以下。ファイルとして送られたこと、MIME、形式の先頭、拡張子、画像の読み込みを検証し、名前・説明・画像の不正を`fields.name`・`fields.description`・`fields.image`へ返す。処理エラーに内部パスを含めない。保存名はサーバーで`image.jpg`・`image.png`・`image.gif`と決め、長い名前や4バイト文字を含む元の画像名もDB・公開URLへ使わずに保存できる。

新規保存は201、同じキー・内容の再送は200で、どちらも`ContentResponse`を返す。`Location`は投稿APIのURL。保存後の画面は`/contents/:id`へ移動する。本文の不足・型の不正は400または422、キーの不足・不正は422。同じキーで名前・説明・画像の内容やファイル名・MIMEが異なる場合は409（`submission_conflict`）で、既存投稿を上書きしない。

本人の行ロック内で既存キーの確認と作成を行い、DBの一意制約でも重複を防ぐ。画像を再処理する前に保存済みかを確認するため、同じmultipartの再送でも投稿・写真を増やさない。入力エラー時は投稿・写真を一緒に保存しない。新しいキーは、同じ本文でも新しい投稿を意図したものとして扱う。

`GET /api/v1/content-submissions/:submission_key`もログイン必須で、本人の保存済み投稿だけを200で返す。未保存・他人のキーは404、不正キーは422。404は元の要求が到着・処理中の場合もあるため、新しいキーで自動再送してはいけない。同じキー・本文・画像での明示的な再送を使う。GETは新しい投稿を作らない。識別子と指紋は通常の投稿・公開プロフィールの応答には含めない。

## 型の生成と検証

Node.js 24で実行する。

```sh
npm ci
npm --prefix tools/api-types ci
npm run api:types
npm run api:types:check
npm run typecheck
```

仕様変更時は`openapi.json`を編集し、型を生成して両方をコミットする。CIは一時ディレクトリで再生成して差分を検出し、古い型が残っていれば失敗する。生成ツールはTypeScriptのプログラムAPIを使うため、`tools/api-types`のTypeScript 5.9.3と依存を独立させ、アプリとE2Eは引き続きTypeScript 7で検査する。SDK・HTTPクライアントは生成しない。

request specで公開範囲・ページング・401・404・422・CSRF・所有者の制限を確認する。E2Eは実際のブラウザーのCookieで本人情報を取得し、CSRFなしの送信と他人のプロフィール更新を拒否することを確認する。型生成だけで実行時のAPI検証を代替しない。

型生成ツールが固定している`js-yaml`は、既知の問題を修正した4.3.2へ限定的に上書きする。生成結果・クリーンインストール・`npm audit`を確認済み。生成ツールが修正版へ更新されたら、この上書きを外す。
