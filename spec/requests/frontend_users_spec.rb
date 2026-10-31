require 'rails_helper'
require 'nokogiri'

RSpec.describe 'Frontend user directory', type: :request do
  let!(:user) { FactoryBot.create(:user, name: '表示するユーザー') }

  it 'keeps the legacy page when the feature is disabled' do
    allow(FrontendAssets).to receive(:new).and_return(FrontendAssets.new(env: {}, development: false))
    get root_path
    expect(response).to have_http_status(:ok)
    expect(response.body).to include(user.name)
    expect(response.body).not_to include('data-react-page', '/frontend/assets/')
  end

  it 'renders the React root for both existing directory URLs with built asset tags' do
    assets = instance_double(FrontendAssets, enabled?: true, development?: false, bundle: {
      script: '/frontend/assets/users.js', stylesheets: ['/frontend/assets/users.css'], preloads: ['/frontend/assets/shared.js']
    })
    allow(FrontendAssets).to receive(:new).and_return(assets)
    [root_path, users_path].each do |path|
      get path
      expect(response).to have_http_status(:ok)
      document = Nokogiri::HTML(response.body)
      expect(document.css('[data-react-page="users"]').size).to eq(1)
      expect(document.at_css('script[src="/frontend/assets/users.js"]')['type']).to eq('module')
      expect(document.at_css('link[rel="stylesheet"][href="/frontend/assets/users.css"]')).not_to be_nil
      expect(document.at_css('link[rel="modulepreload"][href="/frontend/assets/shared.js"]')).not_to be_nil
      expect(response.body).not_to include(user.name)
    end
  end

  it 'loads the same entry on legacy detail pages to support Turbolinks visits' do
    assets = instance_double(FrontendAssets, enabled?: true, development?: false, bundle: { script: '/frontend/assets/users.js', stylesheets: [], preloads: [] })
    allow(FrontendAssets).to receive(:new).and_return(assets)
    get user_path(user)
    expect(response.body).to include('/frontend/assets/users.js')
    expect(response.body).not_to include('data-react-page')
  end

  it 'injects the React Refresh preamble before the development entry' do
    assets = FrontendAssets.new(env: { 'REACT_USERS_ENABLED' => '1', 'VITE_DEV_SERVER_URL' => 'http://frontend:5173' }, development: true)
    allow(FrontendAssets).to receive(:new).and_return(assets)
    get root_path
    expect(response.body).to include('__vite_plugin_react_preamble_installed__', 'http://frontend:5173/@vite/client')
    expect(response.body.index('__vite_plugin_react_preamble_installed__')).to be < response.body.index('src="http://frontend:5173/src/entrypoints/users.tsx"')
  end

  it 'falls back to a working legacy view when a requested build is unavailable' do
    allow(FrontendAssets).to receive(:new).and_return(FrontendAssets.new(root: Rails.root.join('tmp/no-frontend-build'), env: { 'REACT_USERS_ENABLED' => '1' }, development: false))
    get root_path
    expect(response).to have_http_status(:ok)
    expect(response.body).to include(user.name)
    expect(response.body).not_to include('data-react-page')
  end
end
