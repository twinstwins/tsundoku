class ContentsController < ApplicationController
   include ContentsHelper

  def index
    @contents = Content.limit(10).includes(:photos, :user).order('created_at DESC')
    @users = User.all

    @contents_ids = following_user_contents_ids(current_user)
  end

  def show
    @content = Content.find_by(id: params[:id])
    @user = @content.user_id
  end

  def new
    @content = Content.new
    @content.photos.build
  end

  def create
    @content = Content.new(content_params)
    if @content.save
      redirect_to root_path
      flash[:notice] = "投稿が保存されました"
    else
      redirect_to root_path
      flash[:alert] = "投稿に失敗しました"
    end
  end

    private
      def content_params
        params.require(:content).permit(:name,:description, photos_attributes: [:image]).merge(user_id: current_user.id)
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
