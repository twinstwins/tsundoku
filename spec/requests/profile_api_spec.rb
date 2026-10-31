require 'rails_helper'

RSpec.describe 'Public profile contents API', type: :request do
  let(:user) { FactoryBot.create(:user) }
  let(:path) { "/api/v1/users/#{user.id}/contents" }
  def payload; JSON.parse(response.body); end

  it 'returns only public profile fields and stored images without requiring a session' do
    content = user.contents.create!(name: '公開する本', description: '本の説明')
    image = Rack::Test::UploadedFile.new(Rails.root.join('e2e/fixtures/book.png'), 'image/png')
    photo = content.photos.create!(image: image)
    get path
    expect(response).to have_http_status(:ok)
    data = payload['data'].first
    expect(data.keys).to match_array(%w[id name description created_at photos])
    expect(data).to include('id' => content.id, 'name' => content.name)
    expect(data['created_at']).to match(/Z$/)
    expect(data['photos'].first).to eq('id' => photo.id, 'url' => photo.image.url, 'thumbnail_url' => photo.image.thumb.url)
    expect(response.body).not_to include(user.email, 'csrf_token', 'liked_by_current_user')
    expect(response.headers['Cache-Control']).to include('no-store')
    get '/api/v1/contents'
    expect(response).to have_http_status(:unauthorized)
  end

  it 'paginates only the selected author posts in descending ID order' do
    first = user.contents.create!(name: '最初')
    second = user.contents.create!(name: '次')
    FactoryBot.create(:user).contents.create!(name: '他人の投稿')
    get path, params: { per_page: 1 }
    expect(payload['data'].map { |post| post['id'] }).to eq([second.id])
    expect(payload['meta']).to include('total_count' => 2, 'total_pages' => 2)
    get path, params: { per_page: 1, page: 2 }
    expect(payload['data'].map { |post| post['id'] }).to eq([first.id])
    get path, params: { per_page: 1, page: 3 }
    expect(payload['data']).to eq([])
  end

  it 'distinguishes an empty profile from a missing user' do
    get path
    expect(response).to have_http_status(:ok)
    expect(payload['data']).to eq([])
    expect(payload['meta']['total_count']).to eq(0)
    get '/api/v1/users/0/contents'
    expect(response).to have_http_status(:not_found)
    expect(payload.dig('error', 'code')).to eq('not_found')
  end

  it 'rejects unbounded or malformed pagination' do
    [{ page: 'bad' }, { page: 0 }, { per_page: 101 }, { page: [] }].each do |query|
      get path, params: query
      expect(response).to have_http_status(:unprocessable_entity)
      expect(payload.dig('error', 'code')).to eq('validation_error')
    end
  end

  it 'keeps legacy blank names and missing images readable' do
    content = user.contents.create!(name: '移行前の本')
    content.update_column(:name, '')
    get path
    expect(response).to have_http_status(:ok)
    expect(payload['data'].first).to include('name' => '', 'photos' => [])
  end
end
