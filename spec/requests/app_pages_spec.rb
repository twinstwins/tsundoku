require 'rails_helper'

RSpec.describe 'App pages', type: :request do
  include Devise::Test::IntegrationHelpers

  let(:user) { FactoryBot.create(:user, name: '閲覧ユーザー') }

  before { sign_in user }

  it 'shows a content detail when its author has no avatar' do
    content = user.contents.create!(name: '画像なしの本')

    get content_path(content)

    expect(response).to have_http_status(:ok)
    expect(response.body).to include('画像なしの本', 'イメージ未登録')
  end

  it 'shows the names of followed users' do
    followed_user = FactoryBot.create(:user, name: 'フォロー先ユーザー')
    user.follow!(followed_user)

    get following_user_path(user)

    expect(response).to have_http_status(:ok)
    expect(response.body).to include('フォロー先ユーザー')
  end

  it 'shows the names of followers' do
    follower = FactoryBot.create(:user, name: 'フォロワーユーザー')
    follower.follow!(user)

    get followers_user_path(user)

    expect(response).to have_http_status(:ok)
    expect(response.body).to include('フォロワーユーザー')
  end

  it 'submits a new content as a page navigation and shows the saved notice' do
    get new_content_path
    form = Nokogiri::HTML(response.body).at_css('form[action="/contents"]')
    expect(form['data-remote']).not_to eq('true')

    expect do
      post contents_path, params: { content: { name: '新しい本', description: '投稿の確認' } }
    end.to change { user.contents.count }.by(1)

    expect(response).to redirect_to(root_path)
    follow_redirect!
    expect(response.body).to include('投稿が保存されました')
  end

  it 'also submits the content sharing form as a page navigation' do
    user.contents.create!(name: '共有する本')

    get contents_path
    forms = Nokogiri::HTML(response.body).css('form[action="/contents"]')

    expect(forms).not_to be_empty
    expect(forms.map { |form| form['data-remote'] }).not_to include('true')
  end
end
