require 'rails_helper'

RSpec.describe 'Read API v1', type: :request do
  include Devise::Test::IntegrationHelpers

  let(:user) { FactoryBot.create(:user, name: '本人') }
  let(:other) { FactoryBot.create(:user, name: '公開ユーザー') }

  def payload
    JSON.parse(response.body)
  end

  it 'lists public user summaries without email or authentication fields' do
    other
    get '/api/v1/users'
    expect(response).to have_http_status(:ok)
    expect(payload['data'].first.keys).to match_array(%w[id name avatar_url])
    expect(payload['meta']).to include('page' => 1, 'per_page' => 20, 'total_count' => 1, 'total_pages' => 1)
    expect(response.headers['Cache-Control']).to include('no-store')
  end

  it 'paginates users in descending ID order with bounded page sizes' do
    first = FactoryBot.create(:user)
    second = FactoryBot.create(:user)
    get '/api/v1/users', params: { page: 2, per_page: 1 }
    expect(payload['data'].map { |item| item['id'] }).to eq([first.id])
    expect(payload['meta']['total_count']).to eq(2)
    get '/api/v1/users', params: { page: 3, per_page: 1 }
    expect(payload['data']).to eq([])
  end

  it 'rejects invalid pagination with field errors' do
    [{ page: 'abc' }, { page: 0 }, { per_page: 101 }, { per_page: [] }, { page: '9999999999999999999999999999999' }].each do |query|
      get '/api/v1/users', params: query
      expect(response).to have_http_status(:unprocessable_entity)
      expect(payload.dig('error', 'code')).to eq('validation_error')
      expect(payload.dig('error', 'fields')).not_to be_empty
    end
  end

  it 'shows public profile counts and relationship lists without email' do
    user.follow!(other)
    get "/api/v1/users/#{other.id}"
    expect(payload['data']).to include('name' => other.name, 'followers_count' => 1, 'contents_count' => 0)
    expect(payload['data']).not_to have_key('email')
    get "/api/v1/users/#{user.id}/following"
    expect(payload['data'].map { |item| item['id'] }).to eq([other.id])
    get "/api/v1/users/#{other.id}/followers"
    expect(payload['data'].map { |item| item['id'] }).to eq([user.id])
  end

  it 'returns the same JSON 404 shape for absent public resources' do
    get '/api/v1/users/0'
    expect(response).to have_http_status(:not_found)
    expect(payload).to eq('error' => { 'code' => 'not_found', 'message' => '対象が見つかりません', 'fields' => {} })
  end

  it 'requires a session for private information and content endpoints' do
    ['/api/v1/me', '/api/v1/contents', '/api/v1/contents/0'].each do |path|
      get path
      expect(response).to have_http_status(:unauthorized)
      expect(payload.dig('error', 'code')).to eq('unauthenticated')
      expect(response.headers['Location']).to be_nil
    end
  end

  context 'with a session' do
    before { sign_in user }

    it 'returns email and a CSRF token only for the signed-in account' do
      get '/api/v1/me'
      expect(response).to have_http_status(:ok)
      expect(payload['data']).to include('id' => user.id, 'email' => user.email)
      expect(payload['data']['csrf_token']).not_to be_empty
      expect(payload['data']).not_to have_key('encrypted_password')
    end

    it 'represents contents, counts, and the current viewer like status' do
      content = other.contents.create!(name: 'APIの本', description: '内容')
      user.likes.create!(content: content)
      user.comments.create!(content: content, comment: 'コメント')
      get '/api/v1/contents', params: { per_page: 1 }
      expect(response).to have_http_status(:ok)
      expect(payload['data'].first).to include('id' => content.id, 'name' => 'APIの本', 'photos' => [], 'likes_count' => 1, 'comments_count' => 1, 'liked_by_current_user' => true)
      expect(payload['data'].first['user'].keys).to match_array(%w[id name avatar_url])
      get "/api/v1/contents/#{content.id}"
      expect(payload['data']['created_at']).to match(/Z$/)
      expect(payload['data']['description']).to eq('内容')
    end

    it 'filters the following feed while excluding unrelated authors' do
      followed = other
      user.follow!(followed)
      expected_content = followed.contents.create!(name: 'フォロー先の本')
      user.contents.create!(name: '自分の本')
      FactoryBot.create(:user).contents.create!(name: '無関係な本')
      get '/api/v1/contents', params: { feed: 'following' }
      expect(payload['data'].map { |item| item['id'] }).to eq([expected_content.id])
      get '/api/v1/contents', params: { feed: 'unknown' }
      expect(response).to have_http_status(:unprocessable_entity)
      expect(payload.dig('error', 'fields')).to have_key('feed')
    end

    it 'keeps legacy unnamed content readable without changing stored data' do
      content = other.contents.create!(name: '移行前の投稿')
      content.update_column(:name, '')
      get "/api/v1/contents/#{content.id}"
      expect(response).to have_http_status(:ok)
      expect(payload['data']['name']).to eq('')
      expect(content.reload.name).to eq('')
    end

    it 'returns 404 for missing contents' do
      get '/api/v1/contents/0'
      expect(response).to have_http_status(:not_found)
    end
  end

  context 'with CSRF protection enabled' do
    around do |example|
      previous = ApplicationController.allow_forgery_protection
      ApplicationController.allow_forgery_protection = true
      example.run
    ensure
      ApplicationController.allow_forgery_protection = previous
    end

    it 'rejects a session-authenticated write with a missing token and accepts a valid token' do
      sign_in user
      get '/api/v1/me'
      token = payload.dig('data', 'csrf_token')
      expect do
        post contents_path, params: { content: { name: 'CSRFなし' } }, as: :json
      end.not_to change(Content, :count)
      expect(response).to have_http_status(:unprocessable_entity)
      expect(payload.dig('error', 'code')).to eq('invalid_csrf_token')
      expect do
        post contents_path, params: { content: { name: 'CSRFあり' } }, headers: { 'X-CSRF-Token' => token }, as: :json
      end.to change(Content, :count).by(1)
    end
  end
end
