require 'rails_helper'

RSpec.describe 'Follow state API', type: :request do
  include Devise::Test::IntegrationHelpers
  let(:user) { FactoryBot.create(:user) }
  let(:other) { FactoryBot.create(:user) }
  let(:path) { "/api/v1/users/#{other.id}/follow" }
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

  it 'requires a session for private reads and writes before checking CSRF' do
    get path
    expect(response).to have_http_status(:unauthorized)
    [:put, :delete].each do |method|
      expect { write(method) }.not_to change(Relationship, :count)
      expect(response).to have_http_status(:unauthorized)
      expect(payload.dig('error', 'code')).to eq('unauthenticated')
      expect(response.headers['Location']).to be_nil
      expect(response.headers['Cache-Control']).to include('no-store')
    end
  end

  it 'returns viewer state privately and keeps public user responses free of viewer and private fields' do
    user.follow!(other)
    token
    get path
    expect(payload['data']).to eq('user_id' => other.id, 'following_count' => 0, 'followers_count' => 1, 'followed_by_current_user' => true, 'is_current_user' => false)
    expect(response.headers['Cache-Control']).to include('no-store')
    expect(response.body).not_to include('email', 'csrf_token', user.email, other.email)
    get "/api/v1/users/#{user.id}/follow"
    expect(payload['data']).to include('following_count' => 1, 'is_current_user' => true, 'followed_by_current_user' => false)
    sign_out user
    get "/api/v1/users/#{other.id}"
    expect(response).to have_http_status(:ok)
    expect(response.body).not_to include('followed_by_current_user', 'is_current_user', 'email', 'csrf_token')
  end

  it 'checks missing and invalid CSRF tokens on both writes' do
    token
    [nil, 'invalid'].each do |csrf|
      [:put, :delete].each do |method|
        expect { write(method, csrf) }.not_to change(Relationship, :count)
        expect(response).to have_http_status(:unprocessable_entity)
        expect(payload.dig('error', 'code')).to eq('invalid_csrf_token')
      end
    end
  end

  it 'takes the actor from the session and target from the URL, accepting repeated PUT without a body' do
    csrf = token
    different = FactoryBot.create(:user)
    write(:put, csrf, follower_id: other.id, following_id: different.id, user_id: different.id)
    expect(response).to have_http_status(:ok)
    write(:put, csrf)
    expect(response).to have_http_status(:ok)
    expect(Relationship.where(follower: user, following: other).count).to eq(1)
    expect(Relationship.count).to eq(1)
    expect(payload['data']).to include('user_id' => other.id, 'followers_count' => 1, 'followed_by_current_user' => true)
  end

  it 'removes only the caller follow for the target and accepts repeated DELETE' do
    csrf = token
    different = FactoryBot.create(:user)
    foreign = different.following_relationships.create!(following: other)
    untouched = user.following_relationships.create!(following: different)
    user.following_relationships.create!(following: other)
    2.times { write(:delete, csrf, id: foreign.id, follower_id: different.id); expect(response).to have_http_status(:ok) }
    expect(Relationship.exists?(foreign.id)).to be(true)
    expect(Relationship.exists?(untouched.id)).to be(true)
    expect(payload['data']).to include('followers_count' => 1, 'followed_by_current_user' => false)
  end

  it 'rejects self follows without changing data' do
    csrf = token
    [:put, :delete].each do |method|
      expect { write(method, csrf, {}, "/api/v1/users/#{user.id}/follow") }.not_to change(Relationship, :count)
      expect(response).to have_http_status(:unprocessable_entity)
      expect(payload.dig('error', 'fields', 'following_id')).not_to be_empty
    end
  end

  it 'returns JSON 404 for an absent target in every action' do
    csrf = token
    get '/api/v1/users/0/follow'
    expect(response).to have_http_status(:not_found)
    [:put, :delete].each do |method|
      expect { write(method, csrf, {}, '/api/v1/users/0/follow') }.not_to change(Relationship, :count)
      expect(response).to have_http_status(:not_found)
      expect(payload.dig('error', 'code')).to eq('not_found')
    end
  end

  it 'preserves a reverse follow while repeating PUT and DELETE for the caller' do
    csrf = token
    user.following_relationships.create!(following: other)
    reverse = other.following_relationships.create!(following: user)
    2.times { write(:put, csrf) }
    expect(payload['data']).to include('following_count' => 1, 'followers_count' => 1, 'followed_by_current_user' => true)
    write(:delete, csrf)
    expect(payload['data']).to include('following_count' => 1, 'followers_count' => 0, 'followed_by_current_user' => false)
    expect(Relationship.exists?(reverse.id)).to be(true)
  end
end
