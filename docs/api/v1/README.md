# API v1

Reactへの段階移行で使う、Railsと同じオリジンのJSON API。仕様の正本は[openapi.json](openapi.json)、生成したTypeScript型は[`types/api-v1`](../../../types/api-v1)に置く。読み取りに加えて、本人のいいね状態を登録・解除するAPIを提供する。

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

更新操作では`GET /api/v1/me`の`data.csrf_token`を`X-CSRF-Token`ヘッダーに付ける。ログイン・ログアウトなどでセッションが変わった後は取得し直す。CSRF保護を無効化しない。いいねAPIはJSON/no-storeを設定し、認証を確認してからCSRFを検証する。ゲストは401、ログイン済みでトークンが不正なら422となる。

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

コメントは既存仕様の「ユーザーごとに1投稿へ1件」を維持し、空欄と重複を422で拒否する。複数コメントの許可や共有投稿への画像引き継ぎは、新しい更新APIを設計する段階で決める。

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
