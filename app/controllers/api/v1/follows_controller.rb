module Api
  module V1
    class FollowsController < BaseController
      prepend_before_action :require_api_user!
      prepend_before_action :prepare_json_response

      def show
        user = User.find(params[:user_id])
        render json: { data: follow_state(user) }
      end

      def update
        change_follow do |user|
          current_user.following_relationships.find_or_create_by!(following: user)
        end
      end

      def destroy
        change_follow do |user|
          current_user.following_relationships.where(following_id: user.id).find_each(&:destroy!)
        end
      end

      private

      def change_follow
        user = User.find(params[:user_id])
        if user.id == current_user.id
          return render_request_error(:unprocessable_entity, 'validation_error', '自分自身はフォローできません', following_id: ['自分自身はフォローできません'])
        end
        state = user.with_lock do
          yield user
          follow_state(user)
        end
        render json: { data: state }
      end

      def follow_state(user)
        { user_id: user.id, following_count: user.followings.count, followers_count: user.followers.count,
          followed_by_current_user: current_user.following_relationships.exists?(following_id: user.id),
          is_current_user: user.id == current_user.id }
      end
    end
  end
end
