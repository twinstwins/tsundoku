require 'rails_helper'

RSpec.describe 'Comments API', type: :request do
  include Devise::Test::IntegrationHelpers
  let(:user) { FactoryBot.create(:user) }
  let(:other) { FactoryBot.create(:user) }
  let(:content) { other.contents.create!(name: 'コメントする本') }
  let(:path) { "/api/v1/contents/#{content.id}/comments" }
  def payload; JSON.parse(response.body); end
  def token
    sign_in user
    get '/api/v1/me'
    payload.dig('data', 'csrf_token')
  end
  def create_comment(csrf, body = { comment: { comment: '感想\n二行目' } })
    post path, params: body, headers: csrf ? { 'X-CSRF-Token' => csrf } : {}, as: :json
  end

  around do |example|
    previous = ApplicationController.allow_forgery_protection
    ApplicationController.allow_forgery_protection = true
    example.run
  ensure
    ApplicationController.allow_forgery_protection = previous
  end

  it 'requires a session for reading and writing, before validating CSRF' do
    get path
    expect(response).to have_http_status(:unauthorized)
    expect { create_comment(nil) }.not_to change(Comment, :count)
    expect(response).to have_http_status(:unauthorized)
    delete "#{path}/1", as: :json
    expect(response).to have_http_status(:unauthorized)
    expect(payload.dig('error', 'code')).to eq('unauthenticated')
    expect(response.headers['Location']).to be_nil
    expect(response.headers['Cache-Control']).to include('no-store')
  end

  it 'returns newest comments, pagination, and the caller comment outside the page without private fields' do
    own = user.comments.create!(content: content, comment: '先に投稿した本人')
    foreign = other.comments.create!(content: content, comment: '<script>alert(1)</script>')
    different = other.contents.create!(name: '別の投稿')
    other.comments.create!(content: different, comment: '混ぜない')
    token
    get path, params: { per_page: 1 }
    expect(response).to have_http_status(:ok)
    expect(payload['data'].map { |c| c['id'] }).to eq([foreign.id])
    expect(payload['data'].first).to include('owned_by_current_user' => false, 'comment' => foreign.comment)
    expect(payload['current_user_comment']).to include('id' => own.id, 'owned_by_current_user' => true)
    expect(payload['meta']).to include('total_count' => 2, 'total_pages' => 2)
    expect(response.body).not_to include('email', 'csrf_token', user.email, other.email)
    expect(response.headers['Cache-Control']).to include('no-store')
    get path, params: { page: 3, per_page: 1 }
    expect(payload['data']).to eq([])
    expect(payload['current_user_comment']['id']).to eq(own.id)
  end

  it 'returns an empty list and validates page parameters' do
    token
    get path
    expect(payload).to include('data' => [], 'current_user_comment' => nil)
    expect(payload['meta']['total_count']).to eq(0)
    [{ page: 0 }, { per_page: 101 }, { page: 'abc' }].each do |params|
      get path, params: params
      expect(response).to have_http_status(:unprocessable_entity)
    end
  end

  it 'validates CSRF on both writes without changing comments' do
    token
    own = user.comments.create!(content: content, comment: '保存済み')
    [nil, 'invalid'].each do |csrf|
      expect { create_comment(csrf) }.not_to change(Comment, :count)
      expect(response).to have_http_status(:unprocessable_entity)
      expect(payload.dig('error', 'code')).to eq('invalid_csrf_token')
      delete "#{path}/#{own.id}", headers: csrf ? { 'X-CSRF-Token' => csrf } : {}, as: :json
      expect(response).to have_http_status(:unprocessable_entity)
      expect(Comment.exists?(own.id)).to be(true)
    end
  end

  it 'creates only for the session actor and URL post, returning the new comment and count' do
    csrf = token
    different = other.contents.create!(name: '別の投稿')
    create_comment(csrf, comment: { comment: "感想\n二行目", user_id: other.id, content_id: different.id })
    expect(response).to have_http_status(:created)
    expect(Comment.last.user).to eq(user)
    expect(Comment.last.content).to eq(content)
    expect(payload['data']).to include('comment' => "感想\n二行目", 'owned_by_current_user' => true)
    expect(payload['comments_count']).to eq(1)
  end

  it 'rejects blank, non-string, and duplicate comments without overwriting the first' do
    csrf = token
    ['', '  ', 12, [], {}].each do |text|
      expect { create_comment(csrf, comment: { comment: text }) }.not_to change(Comment, :count)
      expect(response).to have_http_status(:unprocessable_entity)
      expect(payload.dig('error', 'fields', 'comment')).not_to be_empty
    end
    create_comment(csrf)
    expect { create_comment(csrf, comment: { comment: '上書きしない' }) }.not_to change(Comment, :count)
    expect(response).to have_http_status(:unprocessable_entity)
    expect(payload.dig('error', 'fields', 'user_id')).not_to be_empty
    expect(Comment.last.comment).to eq('感想\n二行目')
  end

  it 'rejects missing and malformed resource bodies' do
    csrf = token
    [{}, { comment: 'invalid' }].each do |body|
      expect { create_comment(csrf, body) }.not_to change(Comment, :count)
      expect(response).to have_http_status(:bad_request)
      expect(payload.dig('error', 'code')).to eq('invalid_request')
    end
  end

  it 'deletes only an owned comment on the matching post and returns 404 on repeat' do
    csrf = token
    own = user.comments.create!(content: content, comment: '本人')
    foreign = other.comments.create!(content: content, comment: '他人')
    different = other.contents.create!(name: '別の投稿')
    ["#{path}/#{foreign.id}", "/api/v1/contents/#{different.id}/comments/#{own.id}"].each do |url|
      expect { delete url, headers: { 'X-CSRF-Token' => csrf }, as: :json }.not_to change(Comment, :count)
      expect(response).to have_http_status(:not_found)
    end
    delete "#{path}/#{own.id}", headers: { 'X-CSRF-Token' => csrf }, as: :json
    expect(response).to have_http_status(:ok)
    expect(payload['data']).to include('id' => own.id, 'comments_count' => 1)
    expect(Comment.exists?(foreign.id)).to be(true)
    delete "#{path}/#{own.id}", headers: { 'X-CSRF-Token' => csrf }, as: :json
    expect(response).to have_http_status(:not_found)
  end

  it 'returns JSON 404 for missing parents in all actions' do
    csrf = token
    get '/api/v1/contents/0/comments'
    expect(response).to have_http_status(:not_found)
    post '/api/v1/contents/0/comments', params: { comment: { comment: '感想' } }, headers: { 'X-CSRF-Token' => csrf }, as: :json
    expect(response).to have_http_status(:not_found)
    delete '/api/v1/contents/0/comments/1', headers: { 'X-CSRF-Token' => csrf }, as: :json
    expect(response).to have_http_status(:not_found)
    expect(payload.dig('error', 'code')).to eq('not_found')
  end
end
