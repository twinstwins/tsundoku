module Api
  module V1
    class MeController < BaseController
      before_action :require_api_user!

      def show
        render json: { data: public_user_data(current_user).merge(
          email: current_user.email,
          csrf_token: form_authenticity_token
        ) }
      end
    end
  end
end
