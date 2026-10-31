module Api
  module V1
    class LikesController < BaseController
      # Establish JSON/no-store and authentication before CSRF verification.
      prepend_before_action :require_api_user!
      prepend_before_action :prepare_json_response

      def update
        change_like do |content|
          current_user.likes.find_or_create_by!(content: content)
        end
      end

      def destroy
        change_like do |content|
          current_user.likes.where(content_id: content.id).find_each(&:destroy!)
        end
      end

      private

      def change_like
        content = Content.find(params[:content_id])
        state = content.with_lock do
          yield content
          { content_id: content.id, likes_count: content.likes.count,
            liked_by_current_user: current_user.likes.exists?(content_id: content.id) }
        end
        render json: { data: state }
      end
    end
  end
end
