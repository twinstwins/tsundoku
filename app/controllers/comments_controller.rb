class CommentsController < ApplicationController

  before_action :authenticate_user!


  def create
    @comment = Comment.new(comment_params)
    @content = @comment.content
    if @comment.save
      respond_to :js
    else
      flash[:alert] = "コメントに失敗しました"
    end
  end

  def destroy
    @comment = Comment.find_by(id: params[:id])
    @content = @comment.content
    if @comment.destroy
      respond_to :js
    else
      flash[:alert] = "コメントの削除に失敗しました"
    end
  end

  private
    def comment_params
      params.require(:comment).permit(:user_id, :content_id, :comment)
    end

end
