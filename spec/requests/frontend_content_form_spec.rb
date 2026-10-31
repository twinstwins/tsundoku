require 'rails_helper'
require 'nokogiri'

RSpec.describe 'Frontend content form', type: :request do
  include Devise::Test::IntegrationHelpers
  let(:user) { FactoryBot.create(:user) }
  def frontend(env)
    allow(FrontendAssets).to receive(:new).and_return(FrontendAssets.new(env: env, development: true))
  end

  it 'keeps the form private when React is enabled' do
    frontend('REACT_CONTENT_FORM_ENABLED' => '1', 'VITE_DEV_SERVER_URL' => 'http://frontend:5173')
    get new_content_path
    expect(response).to redirect_to(new_user_session_path)
  end

  it 'enables the form independently and avoids caching private drafts in Turbolinks snapshots' do
    sign_in user
    frontend('REACT_CONTENT_FORM_ENABLED' => '1', 'VITE_DEV_SERVER_URL' => 'http://frontend:5173')
    get new_content_path
    doc = Nokogiri::HTML(response.body)
    root = doc.at_css('[data-react-page="content-form"]')
    expect(root['data-user-id']).to eq(user.id.to_s)
    expect(root['data-login-url']).to eq(new_user_session_path(return_to: new_content_path))
    expect(response.headers['Cache-Control']).to include('no-store')
    expect(doc.at_css('meta[name="turbolinks-cache-control"]')['content']).to eq('no-cache')
    get users_path
    expect(response.body).not_to include('data-react-page')
  end

  it 'keeps the legacy form by default and when the built entry is missing' do
    sign_in user
    [{}, { 'REACT_CONTENT_FORM_ENABLED' => '1' }].each do |env|
      assets = FrontendAssets.new(root: Rails.root.join('tmp/no-content-form-build'), env: env, development: false)
      allow(FrontendAssets).to receive(:new).and_return(assets)
      get new_content_path
      expect(response).to have_http_status(:ok)
      expect(Nokogiri::HTML(response.body).at_css('form[action="/contents"]')).not_to be_nil
      expect(response.body).not_to include('data-react-page')
    end
  end
end
