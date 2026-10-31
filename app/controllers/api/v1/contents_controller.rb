module Api
  module V1
    class ContentsController < BaseController
      prepend_before_action :require_api_user!
      prepend_before_action :prepare_json_response

      def index
        relation = Content.all
        if params.key?(:feed)
          raise InvalidQuery.new(:feed, 'allまたはfollowingを指定してください') unless %w[all following].include?(params[:feed])
          relation = relation.where(user_id: current_user.following_ids) if params[:feed] == 'following'
        end
        contents, meta = paginated(relation.includes(:user, :photos))
        render json: { data: content_data(contents), meta: meta }
      end

      def show
        content = Content.includes(:user, :photos).find(params[:id])
        render json: { data: content_data([content]).first }
      end

      def create
        key = request.headers['Idempotency-Key']
        return invalid_submission_key unless valid_submission_key?(key)
        attributes = params.require(:content)
        raise ActionController::ParameterMissing, :content unless attributes.is_a?(ActionController::Parameters)
        input = { name: attributes[:name], description: attributes.key?(:description) ? attributes[:description] : '', image: attributes[:image] }
        result = ContentSubmission.new(current_user, key, input).call
        if result.conflict
          render_request_error(:conflict, 'submission_conflict', '同じ送信識別子で別の内容は投稿できません')
        elsif result.content
          response.headers['Location'] = "/api/v1/contents/#{result.content.id}"
          render json: { data: content_data([result.content]).first }, status: result.created ? :created : :ok
        else
          render_request_error(:unprocessable_entity, 'validation_error', '入力内容を確認してください', result.fields)
        end
      end

      def submission
        key = params[:submission_key]
        return invalid_submission_key unless valid_submission_key?(key)
        content = current_user.contents.includes(:user, :photos).find_by!(submission_key: key)
        render json: { data: content_data([content]).first }
      end

      private

      def valid_submission_key?(key)
        key.is_a?(String) && key.match?(ContentSubmission::KEY_PATTERN)
      end

      def invalid_submission_key
        render_request_error(:unprocessable_entity, 'validation_error', '送信識別子が不正です', submission_key: ['UUID v4を指定してください'])
      end

      def content_data(contents)
        ids = contents.map(&:id)
        like_counts = Like.where(content_id: ids).group(:content_id).count
        comment_counts = Comment.where(content_id: ids).group(:content_id).count
        liked_ids = current_user.likes.where(content_id: ids).pluck(:content_id)
        contents.map do |content|
          {
            id: content.id, name: content.name, description: content.description,
            created_at: content.created_at.utc.iso8601,
            user: public_user_data(content.user),
            photos: content.photos.sort_by(&:id).map { |photo| { id: photo.id, url: photo.image.url, thumbnail_url: photo.image.thumb.url } },
            likes_count: like_counts.fetch(content.id, 0),
            comments_count: comment_counts.fetch(content.id, 0),
            liked_by_current_user: liked_ids.include?(content.id)
          }
        end
      end
    end
  end
end
