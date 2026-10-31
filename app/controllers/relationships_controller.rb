class RelationshipsController < ApplicationController

  before_action :authenticate_user!

  
  def create
    attributes = request_attributes(:relationship, :following_id)
    @user = User.find(attributes.require(:following_id))
    @relationship = current_user.following_relationships.build(following: @user)
    if @relationship.save
      respond_to :js
    else
      render_validation_errors(@relationship)
    end
  end

  def destroy
    @relationship = current_user.following_relationships.find(params[:id])
    @user = @relationship.following
    @relationship.destroy!
    redirect_to @user, notice: 'フォローを解除しました'
  end
end
