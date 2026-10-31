class LikesController < ApplicationController
 before_action :authenticate_user!

  def create
    #この@likeには、current_userの user_id と、content_idが保存される
    @content = Content.find(params[:content_id])
    @like = current_user.likes.build(content: @content)
    if @like.save
      respond_to :js
    else
      render_validation_errors(@like)
    end
  end

  def destroy
    @content = Content.find(params[:content_id])
    @like = current_user.likes.where(content_id: @content.id).find(params[:id])
    if @like.destroy
      respond_to :js
    else
      render_validation_errors(@like)
    end
  end

end
