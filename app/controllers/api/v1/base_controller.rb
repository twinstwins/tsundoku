module Api
  module V1
    class BaseController < ApplicationController
      class InvalidQuery < StandardError
        attr_reader :fields

        def initialize(field, message)
          @fields = { field => [message] }
        end
      end

      before_action :prepare_json_response
      rescue_from InvalidQuery do |error|
        render_request_error(:unprocessable_entity, 'validation_error', '入力内容を確認してください', error.fields)
      end

      private

      def prepare_json_response
        request.format = :json
        response.headers['Cache-Control'] = 'no-store'
      end

      def require_api_user!
        render_request_error(:unauthorized, 'unauthenticated', 'ログインしてください') unless user_signed_in?
      end

      def paginated(relation)
        page = positive_integer(:page, 1, 1_000_000)
        per_page = positive_integer(:per_page, 20, 100)
        count = relation.count
        records = relation.order(id: :desc).limit(per_page).offset((page - 1) * per_page).to_a
        meta = { page: page, per_page: per_page, total_count: count, total_pages: (count.to_f / per_page).ceil }
        [records, meta]
      end

      def positive_integer(key, default, maximum)
        return default unless params.key?(key)
        value = params[key]
        unless value.is_a?(String) && value.match?(/\A[1-9]\d{0,6}\z/) && value.to_i <= maximum
          raise InvalidQuery.new(key, "1から#{maximum}の整数を指定してください")
        end
        value.to_i
      end

      def public_user_data(user)
        { id: user.id, name: user.name.presence || '名無し', avatar_url: user.avatar? ? user.avatar.avatar_image.url : nil }
      end
    end
  end
end
