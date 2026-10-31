module Api
  module V1
    class ContentsController < BaseController
      before_action :require_api_user!

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

      private

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
