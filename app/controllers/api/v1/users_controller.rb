module Api
  module V1
    class UsersController < BaseController
      def index
        render_users(User.all)
      end

      def show
        user = User.find(params[:id])
        render json: { data: public_user_data(user).merge(
          contents_count: user.contents.count,
          following_count: user.followings.count,
          followers_count: user.followers.count
        ) }
      end

      def following
        render_users(User.find(params[:id]).followings)
      end

      def followers
        render_users(User.find(params[:id]).followers)
      end

      def contents
        user = User.find(params[:id])
        contents, meta = paginated(user.contents.includes(:photos))
        render json: { data: contents.map { |content|
          {
            id: content.id, name: content.name, description: content.description,
            created_at: content.created_at.utc.iso8601,
            photos: content.photos.sort_by(&:id).map { |photo| { id: photo.id, url: photo.image.url, thumbnail_url: photo.image.thumb.url } }
          }
        }, meta: meta }
      end

      private

      def render_users(relation)
        users, meta = paginated(relation)
        render json: { data: users.map { |user| public_user_data(user) }, meta: meta }
      end
    end
  end
end
