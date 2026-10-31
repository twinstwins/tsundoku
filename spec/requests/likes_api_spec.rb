require 'rails_helper'

RSpec.describe 'Like state API', type: :request do
  include Devise::Test::IntegrationHelpers
  let(:user) { FactoryBot.create(:user) }
  let(:other) { FactoryBot.create(:user) }
  let(:content) { other.contents.create!(name: 'いいねする本') }
  let(:path) { "/api/v1/contents/#{content.id}/like" }
  def payload; JSON.parse(response.body); end
  def token
    sign_in user
    get '/api/v1/me'
    payload.dig('data', 'csrf_token')
  end
  def write(method, csrf = nil, body = {}, url = path)
    public_send(method, url, params: body, headers: csrf ? { 'X-CSRF-Token' => csrf } : {}, as: :json)
  end

  around do |example|
    previous = ApplicationController.allow_forgery_protection
    ApplicationController.allow_forgery_protection = true
    example.run
  ensure
    ApplicationController.allow_forgery_protection = previous
  end

  it 'returns JSON 401 before CSRF validation for a guest, without changing data' do
    [:put, :delete].each do |method|
      expect { write(method) }.not_to change(Like, :count)
      expect(response).to have_http_status(:unauthorized)
      expect(payload.dig('error', 'code')).to eq('unauthenticated')
      expect(response.headers['Location']).to be_nil
      expect(response.headers['Cache-Control']).to include('no-store')
    end
  end

  it 'rejects missing and invalid CSRF tokens for both writes' do
    token
    [nil, 'invalid'].each do |csrf|
      [:put, :delete].each do |method|
        expect { write(method, csrf) }.not_to change(Like, :count)
        expect(response).to have_http_status(:unprocessable_entity)
        expect(payload.dig('error', 'code')).to eq('invalid_csrf_token')
        expect(response.headers['Cache-Control']).to include('no-store')
      end
    end
  end

  it 'creates one like and returns server counts when the same PUT is repeated' do
    csrf = token
    2.times { write(:put, csrf); expect(response).to have_http_status(:ok) }
    expect(Like.where(user: user, content: content).count).to eq(1)
    expect(payload).to eq('data' => { 'content_id' => content.id, 'likes_count' => 1, 'liked_by_current_user' => true })
    expect(response.headers['Cache-Control']).to include('no-store')
  end

  it 'takes the actor from the session and the post from the route' do
    csrf = token
    different = other.contents.create!(name: '別の投稿')
    write(:put, csrf, { user_id: other.id, content_id: different.id })
    expect(response).to have_http_status(:ok)
    expect(Like.last.user).to eq(user)
    expect(Like.last.content).to eq(content)
    expect(Like.where(user: other)).to be_empty
  end

  it 'removes only the caller like and accepts repeated DELETE requests' do
    csrf = token
    foreign = other.likes.create!(content: content)
    user.likes.create!(content: content)
    different = other.contents.create!(name: '別の投稿')
    untouched = user.likes.create!(content: different)
    2.times { write(:delete, csrf, { user_id: other.id, id: foreign.id }); expect(response).to have_http_status(:ok) }
    expect(Like.exists?(foreign.id)).to be(true)
    expect(Like.exists?(untouched.id)).to be(true)
    expect(payload['data']).to include('likes_count' => 1, 'liked_by_current_user' => false)
  end

  it 'returns JSON 404 for an absent post and does not change likes' do
    csrf = token
    [:put, :delete].each do |method|
      expect { write(method, csrf, {}, '/api/v1/contents/0/like') }.not_to change(Like, :count)
      expect(response).to have_http_status(:not_found)
      expect(payload.dig('error', 'code')).to eq('not_found')
    end
  end

  it 'does not add legacy duplicates and can clear all of the caller duplicates' do
    csrf = token
    2.times { Like.new(user: user, content: content).save!(validate: false) }
    write(:put, csrf)
    expect(response).to have_http_status(:ok)
    expect(Like.where(user: user, content: content).count).to eq(2)
    write(:delete, csrf)
    expect(response).to have_http_status(:ok)
    expect(Like.where(user: user, content: content)).to be_empty
    expect(payload['data']).to include('likes_count' => 0, 'liked_by_current_user' => false)
  end
end
