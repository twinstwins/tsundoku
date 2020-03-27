class LikesController < ApplicationController
 before_action :authenticate_user!

  def create
    #この@likeには、current_userの user_id と、content_idが保存される
    @like = current_user.likes.build(like_params)
    @content = @like.content
    if @like.save
      respond_to :js
    end
  end

  def destroy
    @like = Like.find_by(id: params[:id])
    @content = @like.content
    if @like.destroy
      respond_to :js
    end
  end

private
  def like_params
    params.permit(:content_id)
  end
end
