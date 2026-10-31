class ContentsController < ApplicationController
   include ContentsHelper
  before_action :authenticate_user!, only: [:index, :new, :create]

  def index
    @contents = Content.limit(10).includes(:photos, :user).order('created_at DESC')
    @users = User.all

    @contents_ids = following_user_contents_ids(current_user)
  end

  def show
    response.headers['Cache-Control'] = 'no-store'
    @content = Content.find(params[:id])
    @user = @content.user_id
    render :show_react if user_signed_in? && frontend_assets.enabled?(:content)
  rescue ActiveRecord::RecordNotFound
    raise unless request.format.html?
    render :not_found, status: :not_found
  end

  def new
    @content = Content.new
    @content.photos.build
  end

  def create
    @content = current_user.contents.build(content_params)
    if @content.save
      redirect_to root_path, notice: '投稿が保存されました'
    else
      respond_to do |format|
        format.html do
          @content.photos.build if @content.photos.empty?
          render :new, status: :unprocessable_entity
        end
        format.json { render_validation_errors(@content) }
      end
    end
  end

    private
      def content_params
        request_attributes(:content, :name, :description, photos_attributes: [:image])
      end

      def following_user_contents_ids(owner)
        following_user_ids = owner.following_ids
        contents_ids = []
        following_user_ids.each do |user_id|
          contents_ids.concat(User.find(user_id).content_ids)
        end

        return contents_ids.sort
      end

end
