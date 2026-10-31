require 'rails_helper'
require 'securerandom'
require 'stringio'

RSpec.describe 'Content submission API', type: :request do
  include Devise::Test::IntegrationHelpers
  let(:user) { FactoryBot.create(:user) }
  let(:other) { FactoryBot.create(:user) }
  let(:key) { SecureRandom.uuid }
  def payload; JSON.parse(response.body); end
  def token(account = user)
    sign_in account
    get '/api/v1/me'
    payload.dig('data', 'csrf_token')
  end
  def headers(csrf, identity = key)
    { 'X-CSRF-Token' => csrf, 'Idempotency-Key' => identity }.reject { |_, value| value.nil? }
  end
  def create_post(csrf, attributes = { name: '新しい本', description: "感想\n二行目" }, identity = key)
    post '/api/v1/contents', params: { content: attributes }, headers: headers(csrf, identity)
  end
  def image(bytes = nil, filename = 'book.png', mime = 'image/png')
    Rack::Test::UploadedFile.new(StringIO.new(bytes || File.binread(Rails.root.join('e2e/fixtures/book.png'))), mime, true, original_filename: filename)
  end
  around do |example|
    previous = ApplicationController.allow_forgery_protection
    ApplicationController.allow_forgery_protection = true
    example.run
  ensure
    ApplicationController.allow_forgery_protection = previous
  end

  it 'requires a session before CSRF or submission key validation' do
    expect { create_post(nil) }.not_to change(Content, :count)
    expect(response).to have_http_status(:unauthorized)
    get "/api/v1/content-submissions/#{key}"
    expect(response).to have_http_status(:unauthorized)
    expect(payload.dig('error', 'code')).to eq('unauthenticated')
    expect(response.headers['Location']).to be_nil
    expect(response.headers['Cache-Control']).to include('no-store')
  end

  it 'checks missing and invalid CSRF without creating contents or photos' do
    token
    [nil, 'invalid'].each do |csrf|
      expect { create_post(csrf, name: '画像付き', image: image) }.not_to change(Content, :count)
      expect(response).to have_http_status(:unprocessable_entity)
      expect(payload.dig('error', 'code')).to eq('invalid_csrf_token')
      expect(Photo.count).to eq(0)
    end
  end

  it 'requires a UUID v4 key for creation and lookup' do
    csrf = token
    [nil, '', 'bad', '00000000-0000-0000-0000-000000000000'].each do |identity|
      expect { create_post(csrf, { name: '本' }, identity) }.not_to change(Content, :count)
      expect(response).to have_http_status(:unprocessable_entity)
      expect(payload.dig('error', 'fields', 'submission_key')).not_to be_empty
    end
    get '/api/v1/content-submissions/bad'
    expect(response).to have_http_status(:unprocessable_entity)
  end

  it 'creates a text post for the session actor and ignores submitted identity and association fields' do
    csrf = token
    create_post(csrf, name: '本人の本', description: "説明\n二行目", user_id: other.id,
                      submission_key: SecureRandom.uuid, submission_digest: 'forged', photos_attributes: [{ remote_image_url: 'https://example.test/image.png' }])
    expect(response).to have_http_status(:created)
    content = Content.last
    expect(content.user).to eq(user)
    expect(content.submission_key).to eq(key)
    expect(content.submission_digest.length).to eq(64)
    expect(content.photos).to be_empty
    expect(payload['data']).to include('id' => content.id, 'name' => '本人の本', 'description' => "説明\n二行目")
    expect(response.headers['Location']).to eq("/api/v1/contents/#{content.id}")
    expect(response.headers['Cache-Control']).to include('no-store')
    expect(response.body).not_to include('submission_digest', 'submission_key', user.email)
  end

  it 'returns the same post for repeated JSON requests and permits genuinely new keys' do
    csrf = token
    2.times do |index|
      post '/api/v1/contents', params: { content: { name: 'JSONの本' } }, headers: headers(csrf), as: :json
      expect(response.status).to eq(index.zero? ? 201 : 200)
    end
    expect(user.contents.count).to eq(1)
    saved_id = payload['data']['id']
    get "/api/v1/content-submissions/#{key}"
    expect(payload['data']['id']).to eq(saved_id)
    create_post(csrf, { name: 'JSONの本' }, SecureRandom.uuid)
    expect(response).to have_http_status(:created)
    expect(user.contents.count).to eq(2)
  end

  it 'stores one real image and thumbnail when the same multipart request is repeated' do
    csrf = token
    2.times do |index|
      create_post(csrf, name: '画像付き', description: '', image: image)
      expect(response.status).to eq(index.zero? ? 201 : 200)
    end
    expect(user.contents.count).to eq(1)
    expect(Photo.count).to eq(1)
    expect(File.exist?(Photo.last.image.path)).to be(true)
    expect(File.exist?(Photo.last.image.thumb.path)).to be(true)
    expect(payload['data']['photos'].first['thumbnail_url']).to include('thumb_')
  end

  it 'rejects a changed body or image bytes for a saved key without overwriting the post' do
    csrf = token
    create_post(csrf, name: '元の本', description: '', image: image)
    id = payload['data']['id']
    create_post(csrf, name: '上書きしない', description: '', image: image)
    expect(response).to have_http_status(:conflict)
    expect(payload.dig('error', 'code')).to eq('submission_conflict')
    create_post(csrf, name: '元の本', description: '', image: image(File.binread(Rails.root.join('e2e/fixtures/book.png')) + 'changed'))
    expect(response).to have_http_status(:conflict)
    expect(Content.count).to eq(1)
    expect(Photo.count).to eq(1)
    expect(Content.find(id).name).to eq('元の本')
  end

  it 'uses a server-chosen storage name for long or non-BMP image filenames' do
    csrf = token
    create_post(csrf, name: '画像の保存名', image: image(nil, "#{'本' * 90}\u{1F4DA}.PNG"))
    expect(response).to have_http_status(:created)
    expect(Photo.last.image.identifier).to eq('image.png')
    expect(payload['data']['photos'].first['url']).not_to include('%F0', '本')
  end

  it 'scopes lookup and keys to the signed-in user' do
    create_post(token)
    csrf = token(other)
    get "/api/v1/content-submissions/#{key}"
    expect(response).to have_http_status(:not_found)
    create_post(csrf)
    expect(response).to have_http_status(:created)
    expect(payload['data']['user']['id']).to eq(other.id)
    expect(user.contents.count).to eq(1)
    expect(other.contents.count).to eq(1)
  end

  it 'keeps validation failures atomic and permits correction with the same unused key' do
    csrf = token
    create_post(csrf, name: ' ', description: '保持する説明', image: image)
    expect(response).to have_http_status(:unprocessable_entity)
    expect(payload.dig('error', 'fields', 'name')).not_to be_empty
    expect(Content.count).to eq(0)
    expect(Photo.count).to eq(0)
    get "/api/v1/content-submissions/#{key}"
    expect(response).to have_http_status(:not_found)
    create_post(csrf, name: '修正した名前', description: '保持する説明', image: image)
    expect(response).to have_http_status(:created)
  end

  it 'rejects malformed resource bodies and non-string fields without inserting records' do
    csrf = token
    [{}, { content: 'invalid' }].each do |body|
      post '/api/v1/contents', params: body, headers: headers(csrf), as: :json
      expect(response).to have_http_status(:bad_request)
    end
    [{ name: ['bad'] }, { name: '本', description: {} }, { name: '本', image: 'https://example.test/image.png' }].each do |body|
      post '/api/v1/contents', params: { content: body }, headers: headers(csrf), as: :json
      expect(response).to have_http_status(:unprocessable_entity)
    end
    expect(Content.count).to eq(0)
  end

  it 'rejects oversized or unsupported images and invalid image bytes with field errors' do
    csrf = token
    [image('x' * (5 * 1024 * 1024 + 1)), image(nil, 'book.txt', 'text/plain'), image('not an image'),
     image("\x89PNG\r\n\x1A\ninvalid chunks".b), image('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), image(nil, 'book.html')].each do |upload|
      create_post(csrf, name: '画像の検証', image: upload)
      expect(response).to have_http_status(:unprocessable_entity)
      expect(payload.dig('error', 'fields', 'image')).not_to be_empty
      expect(Content.count).to eq(0)
      expect(Photo.count).to eq(0)
    end
  end

  it 'rejects text the current database cannot store as a field error' do
    csrf = token
    [{ name: 'x' * 256 }, { name: '本', description: 'x' * 65_536 }, { name: "本\u{1F4DA}" }, { name: '本', description: "説明\u{1F600}" }].each do |body|
      create_post(csrf, body)
      expect(response).to have_http_status(:unprocessable_entity)
    end
    expect(Content.count).to eq(0)
  end

  it 'keeps legacy posts without submission keys compatible with the new unique index' do
    2.times { user.contents.create!(name: '以前からの投稿') }
    expect(user.contents.where(submission_key: nil).count).to eq(2)
    csrf = token
    create_post(csrf)
    expect(response).to have_http_status(:created)
    expect(user.contents.count).to eq(3)
  end
end
