module Api
  module V1
    class CommentsController < BaseController
      prepend_before_action :require_api_user!
      prepend_before_action :prepare_json_response

      def index
        content = Content.find(params[:content_id])
        comments, meta = paginated(content.comments.includes(:user))
        own = current_user.comments.where(content_id: content.id).order(:id).first
        render json: { data: comments.map { |comment| comment_data(comment) }, meta: meta,
                       current_user_comment: own && comment_data(own) }
      end

      def create
        content = Content.find(params[:content_id])
        attributes = request_attributes(:comment, :comment)
        comment = content.comments.build(attributes)
        comment.user = current_user
        unless attributes[:comment].is_a?(String)
          comment.errors.add(:comment, '文字列で入力してください')
          return render_validation_errors(comment)
        end
        result = content.with_lock do
          if comment.save
            { data: comment_data(comment), comments_count: content.comments.count }
          end
        end
        result ? render(json: result, status: :created) : render_validation_errors(comment)
      end

      def destroy
        content = Content.find(params[:content_id])
        result = content.with_lock do
          comment = current_user.comments.where(content_id: content.id).find(params[:id])
          comment.destroy!
          { data: { id: comment.id, content_id: content.id, comments_count: content.comments.count } }
        end
        render json: result
      end

      private

      def comment_data(comment)
        { id: comment.id, content_id: comment.content_id, comment: comment.comment,
          created_at: comment.created_at.utc.iso8601, user: public_user_data(comment.user),
          owned_by_current_user: comment.user_id == current_user.id }
      end
    end
  end
end
