class ApplicationController < ActionController::Base
  protect_from_forgery with: :exception
  helper_method :frontend_assets
  before_action :configure_permitted_parameters, if: :devise_controller?

  rescue_from ActiveRecord::RecordNotFound do
    render_request_error(:not_found, 'not_found', '対象が見つかりません')
  end
  rescue_from ActionController::ParameterMissing do |error|
    render_request_error(:bad_request, 'invalid_request', '必要な入力がありません', error.param.to_s => ['入力してください'])
  end
  rescue_from ActionController::InvalidAuthenticityToken do
    render_request_error(:unprocessable_entity, 'invalid_csrf_token', '画面を更新してから再度お試しください')
  end
  rescue_from ActiveRecord::RecordNotUnique do
    render_request_error(:conflict, 'conflict', 'すでに登録されています')
  end

  private

  def frontend_assets
    @frontend_assets ||= FrontendAssets.new
  end

  def request_attributes(key, *permitted)
    attributes = params.require(key)
    raise ActionController::ParameterMissing, key unless attributes.is_a?(ActionController::Parameters)
    attributes.permit(*permitted)
  end

  def render_validation_errors(record)
    render_request_error(:unprocessable_entity, 'validation_error', '入力内容を確認してください', record.errors.to_hash)
  end

  def render_request_error(status, code, message, fields = {})
    respond_to do |format|
      format.json { render json: { error: { code: code, message: message, fields: fields } }, status: status }
      format.js { render plain: message, status: status }
      format.any { head status }
    end
  end

  protected

    def configure_permitted_parameters
      devise_parameter_sanitizer.permit(:sign_up, keys: [:name, :avatar])
      devise_parameter_sanitizer.permit(:account_update, keys: [:name, :avatar,])
    end
end
