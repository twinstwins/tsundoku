require 'rails_helper'

RSpec.describe 'Page authorization and validation', type: :request do
  include Devise::Test::IntegrationHelpers

  let(:user) { FactoryBot.create(:user) }
  let(:other) { FactoryBot.create(:user) }
  let(:content) { other.contents.create!(name: '他の人の本') }
  let(:js_headers) { { 'ACCEPT' => 'text/javascript', 'X-Requested-With' => 'XMLHttpRequest' } }

  context 'without a session' do
    it 'requires sign in for content forms and the feed' do
      [new_content_path, contents_path].each do |path|
        get path
        expect(response).to redirect_to(new_user_session_path)
      end
      expect { post contents_path, params: { content: { name: '未認証の投稿' } } }.not_to change(Content, :count)
      expect(response).to redirect_to(new_user_session_path)
    end

    it 'requires sign in before editing profiles' do
      patch user_path(other), params: { user: { name: '不正な変更' } }
      expect(response).to redirect_to(new_user_session_path)
      expect(other.reload.name).not_to eq('不正な変更')
    end
  end

  context 'with a session' do
    before { sign_in user }

    it 'rejects another user profile edit and update' do
      get edit_user_path(other)
      expect(response).to have_http_status(:not_found)
      patch user_path(other), params: { user: { name: '不正な変更' } }
      expect(response).to have_http_status(:not_found)
      expect(other.reload.name).not_to eq('不正な変更')
    end

    it 'updates only name and avatar through the simple profile form' do
      old_email = user.email
      old_password = user.encrypted_password
      patch user_path(user), params: { user: { name: '本人の変更', email: 'changed@example.test', password: 'NewPassword123!' } }
      expect(response).to redirect_to(user_path(user))
      expect(user.reload.name).to eq('本人の変更')
      expect(user.email).to eq(old_email)
      expect(user.encrypted_password).to eq(old_password)
    end

    it 'returns 404 for missing users and contents' do
      get user_path(id: 0)
      expect(response).to have_http_status(:not_found)
      get content_path(id: 0)
      expect(response).to have_http_status(:not_found)
    end

    it 'shows an invalid content form without inserting a blank name' do
      expect do
        post contents_path, params: { content: { name: ' ', description: '入力内容を保持' } }
      end.not_to change(Content, :count)
      expect(response).to have_http_status(:unprocessable_entity)
      expect(response.body).to include('入力内容を保持')
    end

    it 'ignores a submitted author ID when creating content' do
      post contents_path, params: { content: { name: '本人の本', user_id: other.id } }
      expect(response).to redirect_to(root_path)
      expect(Content.last.user).to eq(user)
    end

    it 'returns a JSON 400 for a missing or malformed resource body' do
      [{}, { content: 'not an object' }].each do |body|
        post contents_path, params: body, as: :json
        expect(response).to have_http_status(:bad_request)
        expect(JSON.parse(response.body).dig('error', 'code')).to eq('invalid_request')
      end
    end

    it 'returns a JSON 422 with field errors for invalid content' do
      post contents_path, params: { content: { name: '' } }, as: :json
      expect(response).to have_http_status(:unprocessable_entity)
      expect(JSON.parse(response.body).dig('error', 'fields', 'name')).not_to be_empty
    end

    it 'takes the comment author from the session and the content from the route' do
      different_content = other.contents.create!(name: '別の本')
      post content_comments_path(content), params: { comment: { comment: '本人のコメント', user_id: other.id, content_id: different_content.id } }, headers: js_headers
      expect(response).to have_http_status(:ok)
      expect(Comment.last.user).to eq(user)
      expect(Comment.last.content).to eq(content)
    end

    it 'rejects blank and duplicate comments without adding a row' do
      post content_comments_path(content), params: { comment: { comment: '' } }, headers: js_headers
      expect(response).to have_http_status(:unprocessable_entity)
      expect(Comment.where(user: user, content: content)).to be_empty
      user.comments.create!(content: content, comment: '最初のコメント')
      expect do
        post content_comments_path(content), params: { comment: { comment: '二重のコメント' } }, headers: js_headers
      end.not_to change(Comment, :count)
      expect(response).to have_http_status(:unprocessable_entity)
    end

    it 'rejects another user comment deletion' do
      comment = other.comments.create!(content: content, comment: '他人のコメント')
      expect { delete content_comment_path(content, comment), headers: js_headers }.not_to change(Comment, :count)
      expect(response).to have_http_status(:not_found)
    end

    it 'matches the parent route before deleting an owned comment' do
      comment = user.comments.create!(content: content, comment: '本人のコメント')
      different_content = other.contents.create!(name: '別の本')
      delete content_comment_path(different_content, comment), headers: js_headers
      expect(response).to have_http_status(:not_found)
      expect { delete content_comment_path(content, comment), headers: js_headers }.to change(Comment, :count).by(-1)
      expect(response).to have_http_status(:ok)
    end

    it 'rejects another user like deletion and mismatched parent routes' do
      foreign_like = other.likes.create!(content: content)
      delete content_like_path(content, foreign_like), headers: js_headers
      expect(response).to have_http_status(:not_found)
      expect(Like.exists?(foreign_like.id)).to be(true)
      owned_like = user.likes.create!(content: content)
      different_content = other.contents.create!(name: '別の本')
      delete content_like_path(different_content, owned_like), headers: js_headers
      expect(response).to have_http_status(:not_found)
      expect { delete content_like_path(content, owned_like), headers: js_headers }.to change(Like, :count).by(-1)
    end

    it 'returns 422 for a duplicate like' do
      user.likes.create!(content: content)
      expect { post content_likes_path(content), headers: js_headers }.not_to change(Like, :count)
      expect(response).to have_http_status(:unprocessable_entity)
    end

    it 'rejects deleting a relationship owned by another user' do
      relationship = other.following_relationships.create!(following: user)
      expect { delete relationship_path(relationship) }.not_to change(Relationship, :count)
      expect(response).to have_http_status(:not_found)
    end

    it 'rejects self follows and duplicate follows with 422' do
      post relationships_path, params: { relationship: { following_id: user.id } }, headers: js_headers
      expect(response).to have_http_status(:unprocessable_entity)
      expect(Relationship.where(follower_id: user.id)).to be_empty
      user.follow!(other)
      expect do
        post relationships_path, params: { relationship: { following_id: other.id } }, headers: js_headers
      end.not_to change(Relationship, :count)
      expect(response).to have_http_status(:unprocessable_entity)
    end
  end
end
