class LikesController < ApplicationController
 before_action :authenticate_user!

  def create
    #この@likeには、current_userの user_id と、content_idが保存される
    @content = Content.find(params[:content_id])
    saved = @content.with_lock do
      @like = current_user.likes.build(content: @content)
      @like.save
    end
    if saved
      respond_to :js
    else
      render_validation_errors(@like)
    end
  end

  def destroy
    @content = Content.find(params[:content_id])
    destroyed = @content.with_lock do
      @like = current_user.likes.where(content_id: @content.id).find(params[:id])
      @like.destroy
    end
    if destroyed
      respond_to :js
    else
      render_validation_errors(@like)
    end
  end

end
