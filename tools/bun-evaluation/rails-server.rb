# This entry point adds the evaluation route only to the isolated test server.
# Normal Rails startup does not load this file or expose the route.
require_relative '../../config/environment'
require 'json'
require 'fileutils'
require 'rack/handler/puma'

class EvaluationFrontendController < ApplicationController
  def show
    manifest = JSON.parse(File.read(Rails.root.join('public/bun-evaluation/.vite/manifest.json')))
    entry = manifest.fetch('src/main.tsx')
    @css = entry.fetch('css')
    @js = entry.fetch('file')
    render inline: <<~HTML, layout: false
      <!doctype html><html lang="ja"><head><meta charset="UTF-8">
      <title>フロントの動作検証</title><link rel="icon" href="data:,">
      <% @css.each do |file| %><link rel="stylesheet" href="/bun-evaluation/<%= file %>"><% end %>
      </head><body><div id="root"></div>
      <script type="module" src="/bun-evaluation/<%= @js %>"></script>
      </body></html>
    HTML
  end
end

Rails.application.routes.prepend { get '/__frontend_evaluation', to: 'evaluation_frontend#show' }
Rails.application.reload_routes!
FileUtils.mkdir_p(Rails.root.join('tmp/pids'))
Rack::Handler::Puma.run(Rails.application, Host: '0.0.0.0', Port: 3000)
