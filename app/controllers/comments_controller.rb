class CommentsController < ApplicationController

  before_action :authenticate_user!


  def create
    @content = Content.find(params[:content_id])
    @comment = @content.comments.build(comment_params)
    @comment.user = current_user
    if @comment.save
      respond_to :js
    else
      render_validation_errors(@comment)
    end
  end

  def destroy
    @content = Content.find(params[:content_id])
    @comment = current_user.comments.where(content_id: @content.id).find(params[:id])
    if @comment.destroy
      respond_to :js
    else
      render_validation_errors(@comment)
    end
  end

  private
    def comment_params
      request_attributes(:comment, :comment)
    end

end
