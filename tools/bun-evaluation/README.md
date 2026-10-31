# Bun比較検証の再実行

結果と採用判断は[検証結果](../../docs/bun-evaluation.md)に記録する。検証コードと最小React画面はこのディレクトリに閉じ込め、通常のアプリ起動には組み込まない。

## Dockerで5回比較する

```sh
docker compose -f compose.e2e.yml -f compose.bun-evaluation.yml build web e2e
docker compose -f compose.e2e.yml -f compose.bun-evaluation.yml run --rm e2e
```

Bun 1.4.4、Node.js 24.22.1、Playwright 1.64.1を固定する。版が合わない場合は測定を中止する。次の3構成を比較し、2回目以降は実行順を交互に入れ替える。

| 名前 | 依存の導入 | JavaScriptの実行 |
| --- | --- | --- |
| `npm-node` | `npm ci --no-audit --no-fund` | Node.js |
| `bun-node` | `bun install --frozen-lockfile` | Node.js |
| `bun-bun` | `bun install --frozen-lockfile` | Bun |

CLIのJSファイルをNodeまたはBunへ直接渡し、preloadで`process.execPath`と`process.versions`を記録する。Bunで起動して内部ではNodeが使われていた、という判定を避ける。TypeScript 7の型検査本体は共通のネイティブ実行ファイルで、比較するのは同じ型検査を呼ぶ処理。Bun独自の型検査機能には置き換えない。

元の`package-lock.json`を含むソースを`tmp/bun-evaluation/<label>/<mode>/`へ複製する。Bunのlockfileは複製側でだけ移行・生成し、その後は固定して使う。通常の依存・lockfileを書き換えない。各構成で導入したパッケージの名前・版の集合と、ビルドしたJS・CSSのSHA-256を比較する。

導入のcold測定では毎回専用キャッシュを空にし、warm測定では同じキャッシュを使って`node_modules`を削除してから再導入する。対象はルート、API型生成ツール、Reactサンプルの3プロジェクトの合計。OSのディスクキャッシュや外部ネットワークの状態を固定した測定ではない。

Viteの起動はプロセス起動からReactの見出しが表示されるまでを測る。coldではViteの依存変換キャッシュを削除する。初回はコンポーネントを書き換え、カウンターの値と同じHTML文書を保持して表示が更新されることを確認する。本番ビルドは専用Railsサーバーがmanifestを読み、実際にJS・CSSを配信する。クリックと再読込も確認する。

E2Eは既存のPC・モバイル24ケースを`--retries=0`で実行し、24件成功・失敗なし・スキップなしを要求する。コマンドの所要時間とPlaywrightが計測した実行時間を別々に残す。互換性の確認に失敗した候補は以後の測定を止める。

一時的なDBとアップロード画像は専用コンテナ内に置く。ホストへ共有するのは検証用のビルド成果物だけ。`/__frontend_evaluation`は専用の`rails-server.rb`を起動した場合にだけ追加される。通常のRails起動でこのルートを公開しない。

結果、実行コマンド別ログ、PlaywrightのJSONレポート、実行環境の記録は`tmp/bun-evaluation/results/<label>/`に残す。既定のlabelは`linux`。再実行すると同じlabelの結果は置き換わる。確認後は専用環境を片付ける。

```sh
docker compose -f compose.e2e.yml -f compose.bun-evaluation.yml down -v --remove-orphans
```

## macOSから確認する

上の専用Railsサーバーを起動し、ローカルにNode.js 24.22.1、Bun 1.4.4とPlaywrightのChromiumを用意する。開発環境の設定変更が必要な場合は[Bunの固定版インストール手順](https://bun.sh/docs/installation#installing-older-versions)を参照する。

```sh
docker compose -f compose.e2e.yml -f compose.bun-evaluation.yml up -d web
npm ci
npx playwright install chromium
EVALUATION_LABEL=macos EVALUATION_RUNS=5 EVALUATION_E2E_RUNS=1 node tools/bun-evaluation/evaluate.mjs
```

この例は導入・型生成・型検査・Viteを5回、E2Eを各構成1回確認する。E2Eも5回測る場合は`EVALUATION_E2E_RUNS=5`を指定する。同じマシンで複数の測定を同時に走らせない。

## GitHub Actions

`Bun evaluation`は検証ツールを変更したPRで各1回の互換性確認を実行する。今回の比較調査ではCIでも各5回を実行した。マージ後は手動実行から1回または5回を選べる。通常の`E2E`ワークフローはNode.jsとnpmで継続する。

Node基準とBunでの依存管理の成功・依存版の一致・ビルド成果物の一致を必須にする。Bunでの実行だけが失敗した場合は候補の評価結果として保存するため、ジョブ全体の成功をBunの全面互換と解釈しない。対応表はジョブのSummary、詳しい失敗は7日間保存する`bun-evaluation`成果物で確認する。

完了した結果を集計するには、`node tools/bun-evaluation/summarize.mjs <results.json> ...`を使う。各試行の値、中央値・最小・最大、成功件数、互換性、実行環境をJSONで標準出力へ返す。未完了の結果は集計しない。
