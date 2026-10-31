require 'rails_helper'
require 'tmpdir'
require 'fileutils'

RSpec.describe FrontendAssets do
  around do |example|
    Dir.mktmpdir('tsundoku-assets') do |directory|
      @directory = Pathname.new(directory)
      FileUtils.mkdir_p(@directory.join('public/frontend/.vite'))
      FileUtils.mkdir_p(@directory.join('public/frontend/assets'))
      %w[users.js shared.js nested.js users.css shared.css].each { |file| File.write(@directory.join('public/frontend/assets', file), 'asset') }
      example.run
    end
  end

  def manifest(value)
    File.write(@directory.join('public/frontend/.vite/manifest.json'), JSON.generate(value))
  end

  def entry(extra = {})
    { FrontendAssets::ENTRY => { 'isEntry' => true, 'file' => 'assets/users.js', 'css' => ['assets/users.css'] }.merge(extra) }
  end

  def assets(env = { 'REACT_USERS_ENABLED' => '1' }, development = false)
    described_class.new(root: @directory, env: env, development: development)
  end

  it 'keeps the feature disabled by default, even when a build exists' do
    manifest(entry)
    expect(assets({}).enabled?).to be(false)
  end

  it 'enables the shared entry while keeping the two page flags independent' do
    manifest(entry)
    users = assets('REACT_USERS_ENABLED' => '1')
    content = assets('REACT_CONTENT_DETAIL_ENABLED' => '1')
    expect(users.enabled?).to be(true)
    expect(users.enabled?(:users)).to be(true)
    expect(users.enabled?(:content)).to be(false)
    expect(content.enabled?).to be(true)
    expect(content.enabled?(:users)).to be(false)
    expect(content.enabled?(:content)).to be(true)
  end

  it 'reads transitive imports and orders shared CSS before entry CSS once' do
    data = entry('imports' => ['shared', 'nested'])
    data['shared'] = { 'file' => 'assets/shared.js', 'css' => ['assets/shared.css'], 'imports' => ['nested'] }
    data['nested'] = { 'file' => 'assets/nested.js', 'css' => ['assets/shared.css'] }
    manifest(data)
    instance = assets
    expect(instance.enabled?).to be(true)
    expect(instance.bundle).to eq(script: '/frontend/assets/users.js', stylesheets: ['/frontend/assets/shared.css', '/frontend/assets/users.css'], preloads: ['/frontend/assets/nested.js', '/frontend/assets/shared.js'])
  end

  it 'handles an import cycle without duplicating the entry preload' do
    data = entry('imports' => ['shared'])
    data['shared'] = { 'file' => 'assets/shared.js', 'imports' => [FrontendAssets::ENTRY] }
    manifest(data)
    expect(assets.bundle[:preloads]).to eq(['/frontend/assets/shared.js'])
  end

  it 'disables React if the manifest is absent or invalid JSON' do
    expect(assets.enabled?).to be(false)
    File.write(@directory.join('public/frontend/.vite/manifest.json'), '{')
    expect(assets.enabled?).to be(false)
  end

  it 'disables React if its entry, imported chunk, or file is absent' do
    [{}, entry('imports' => ['absent']), entry('file' => 'assets/absent.js')].each do |data|
      manifest(data)
      expect(assets.enabled?).to be(false)
    end
  end

  it 'rejects traversal paths and malformed CSS/import data' do
    [entry('file' => 'assets/../users.js'), entry('css' => ['https://other.test/style.css']), entry('imports' => 'shared'), entry('css' => nil)].each do |data|
      manifest(data)
      expect(assets.enabled?).to be(false)
    end
  end

  it 'uses an explicit development origin without requiring a build' do
    instance = assets({ 'REACT_USERS_ENABLED' => '1', 'VITE_DEV_SERVER_URL' => 'http://frontend:5173/' }, true)
    expect(instance.enabled?).to be(true)
    expect(instance.development_origin).to eq('http://frontend:5173')
  end

  it 'never uses a development server in production' do
    manifest(entry)
    instance = assets('REACT_USERS_ENABLED' => '1', 'VITE_DEV_SERVER_URL' => 'http://frontend:5173')
    expect(instance.enabled?).to be(true)
    expect(instance.development?).to be(false)
    expect(instance.bundle[:script]).to eq('/frontend/assets/users.js')
  end

  it 'rejects development origins with credentials, paths, or script schemes' do
    ['javascript:alert(1)', 'http://user:secret@localhost:5173', 'http://localhost:5173/path', 'http://localhost:5173/?token=x'].each do |origin|
      expect(assets({ 'REACT_USERS_ENABLED' => '1', 'VITE_DEV_SERVER_URL' => origin }, true).enabled?).to be(false)
    end
  end
end
