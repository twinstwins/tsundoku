require 'rails_helper'
require 'nokogiri'

RSpec.describe 'Frontend profile', type: :request do
  include Devise::Test::IntegrationHelpers
  let(:user) { FactoryBot.create(:user, name: 'プロフィールの本人') }
  let(:other) { FactoryBot.create(:user, name: '別の読者') }

  def frontend(enabled)
    env = { 'REACT_PROFILE_ENABLED' => enabled ? '1' : '0', 'VITE_DEV_SERVER_URL' => 'http://frontend:5173' }
    allow(FrontendAssets).to receive(:new).and_call_original
    allow(FrontendAssets).to receive(:new).and_return(FrontendAssets.new(env: env, development: true))
  end

  it 'keeps a usable legacy profile when disabled, including text post links and the count' do
    frontend(false)
    content = user.contents.create!(name: 'プロフィールの本')
    get user_path(user)
    expect(response).to have_http_status(:ok)
    expect(response.body).to include('1積んでいます', content_path(content))
    expect(response.body).not_to include('data-react-page')
  end

  it 'renders two public React regions around Rails-owned actions, independently of other flags' do
    frontend(true)
    sign_in other
    get user_path(user)
    doc = Nokogiri::HTML(response.body)
    expect(doc.css('[data-react-page]').map { |node| node['data-react-page'] }).to eq(%w[profile profile-posts])
    form = doc.at_css('#following_form form')
    expect(form['data-remote']).to eq('true')
    expect(form.ancestors('[data-react-page]')).to be_empty
    expect(doc.at_css('#follow_counter').ancestors('[data-react-page]')).to be_empty
    get users_path
    expect(response.body).not_to include('data-react-page')
  end

  it 'never exposes another user email or edit controls, in either rendering mode' do
    [false, true].each do |enabled|
      frontend(enabled)
      [nil, other].each do |viewer|
        viewer ? sign_in(viewer) : sign_out(:user)
        get user_path(user)
        expect(response.body).not_to include(user.email, edit_user_path(user))
      end
    end
  end

  it 'shows owner-only details and prevents cached profile snapshots in both modes' do
    sign_in user
    [false, true].each do |enabled|
      frontend(enabled)
      get user_path(user)
      expect(response.body).to include(user.email, edit_user_path(user), edit_user_registration_path)
      expect(response.headers['Cache-Control']).to include('no-store')
      doc = Nokogiri::HTML(response.body)
      expect(doc.at_css('meta[name="turbolinks-cache-control"]')['content']).to eq('no-cache')
      expect(doc.css('input[value="Follow"]')).to be_empty
    end
  end

  it 'renders a visible HTTP 404 page and preserves the JSON error shape' do
    frontend(true)
    get '/users/0'
    expect(response).to have_http_status(:not_found)
    expect(response.body).to include('ユーザーが見つかりません')
    get '/users/0', as: :json
    expect(response).to have_http_status(:not_found)
    expect(JSON.parse(response.body).dig('error', 'code')).to eq('not_found')
  end

  it 'falls back to the safe legacy profile when the requested build is missing' do
    assets = FrontendAssets.new(root: Rails.root.join('tmp/no-profile-build'), env: { 'REACT_PROFILE_ENABLED' => '1' }, development: false)
    allow(FrontendAssets).to receive(:new).and_return(assets)
    get user_path(user)
    expect(response).to have_http_status(:ok)
    expect(response.body).to include(user.name)
    expect(response.body).not_to include('data-react-page', user.email)
  end
end
