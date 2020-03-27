class RelationshipsController < ApplicationController

  before_action :authenticate_user!

  
  def create
    @user = User.find(params[:relationship][:following_id])
    # current_user.follow!(@user)
    # redirect_to @user
    if current_user.follow!(@user)
      respond_to :js
    end
  end

  def destroy
    @user = Relationship.find(params[:id]).following
    current_user.unfollow!(@user)
    redirect_to @user
    flash[:alert] = "フォローを解除しました"
  end
end
