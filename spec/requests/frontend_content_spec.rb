require 'rails_helper'
require 'nokogiri'

RSpec.describe 'Frontend content detail', type: :request do
  include Devise::Test::IntegrationHelpers
  let(:user) { FactoryBot.create(:user) }
  let!(:content) { user.contents.create!(name: '表示する本', description: '本の紹介') }

  def frontend(env)
    allow(FrontendAssets).to receive(:new).and_return(FrontendAssets.new(env: env, development: true))
  end

  it 'keeps the existing detail when only the directory flag is enabled' do
    sign_in user
    frontend('REACT_USERS_ENABLED' => '1', 'VITE_DEV_SERVER_URL' => 'http://frontend:5173')
    get content_path(content)
    expect(response).to have_http_status(:ok)
    expect(response.body).to include(content.name)
    expect(response.body).not_to include('data-react-page')
  end

  it 'enables content independently of the directory and passes the login return URL' do
    sign_in user
    frontend('REACT_CONTENT_DETAIL_ENABLED' => '1', 'VITE_DEV_SERVER_URL' => 'http://frontend:5173')
    get content_path(content)
    document = Nokogiri::HTML(response.body)
    root = document.at_css('[data-react-page="content"]')
    expect(response).to have_http_status(:ok)
    expect(root['data-content-id']).to eq(content.id.to_s)
    expect(root['data-login-url']).to eq(new_user_session_path(return_to: content_path(content)))
    expect(response.body).to include('/src/entrypoints/application.tsx')
    expect(response.headers['Cache-Control']).to include('no-store')
    get users_path
    expect(response.body).not_to include('data-react-page')
    expect(response.body).to include(user.name)
  end

  it 'keeps the existing public view for guests and still protects the content API' do
    frontend('REACT_CONTENT_DETAIL_ENABLED' => '1', 'VITE_DEV_SERVER_URL' => 'http://frontend:5173')
    get content_path(content)
    expect(response).to have_http_status(:ok)
    expect(response.body).to include(content.name, 'イメージ未登録')
    expect(response.body).not_to include('data-react-page')
    author_links = Nokogiri::HTML(response.body).css("a[href='#{user_path(user)}']")
    expect(author_links.size).to eq(2)
    expect(author_links.map(&:text)).to eq([user.name, user.name])
    get "/api/v1/contents/#{content.id}"
    expect(response).to have_http_status(:unauthorized)
  end

  it 'returns a real HTTP 404 before rendering React for a missing post' do
    sign_in user
    frontend('REACT_CONTENT_DETAIL_ENABLED' => '1', 'VITE_DEV_SERVER_URL' => 'http://frontend:5173')
    get '/contents/0'
    expect(response).to have_http_status(:not_found)
    expect(response.body).to include('投稿が見つかりません')
    expect(response.body).not_to include('data-react-page')
    get '/contents/0', as: :json
    expect(response).to have_http_status(:not_found)
    expect(JSON.parse(response.body).dig('error', 'code')).to eq('not_found')
  end

  it 'falls back to the existing detail when the requested build is missing' do
    sign_in user
    assets = FrontendAssets.new(root: Rails.root.join('tmp/no-content-build'), env: { 'REACT_CONTENT_DETAIL_ENABLED' => '1' }, development: false)
    allow(FrontendAssets).to receive(:new).and_return(assets)
    get content_path(content)
    expect(response).to have_http_status(:ok)
    expect(response.body).to include(content.name)
    expect(response.body).not_to include('data-react-page')
  end
end

RSpec.describe 'Content login return', type: :request do
  let!(:user) { FactoryBot.create(:user) }

  it 'returns to the requested post after signing in' do
    get new_user_session_path, params: { return_to: '/contents/123' }
    post user_session_path, params: { user: { email: user.email, password: 'password' } }
    expect(response).to redirect_to('/contents/123')
  end

  it 'ignores external, malformed, and non-content return destinations' do
    ['https://other.test/contents/1', '//other.test/contents/1', '/users/1', '/contents/1?next=other', '/contents/../users', ['/contents/1']].each do |path|
      reset!
      get new_user_session_path, params: { return_to: path }
      post user_session_path, params: { user: { email: user.email, password: 'password' } }
      expect(response).to redirect_to(root_path)
    end
  end
end
