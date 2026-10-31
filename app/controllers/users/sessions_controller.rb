# frozen_string_literal: true

class Users::SessionsController < Devise::SessionsController
  before_action :store_content_return_path, only: :new

  private

  def store_content_return_path
    path = params[:return_to]
    store_location_for(:user, path) if path.is_a?(String) && (path == '/contents/new' || path.match?(%r{\A/(?:contents|users)/[1-9]\d{0,18}\z}))
  end
end
