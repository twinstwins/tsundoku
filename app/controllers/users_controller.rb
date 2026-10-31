class UsersController < ApplicationController
  before_action :authenticate_user!, only: [:edit, :update]
  before_action :set_editable_user, only: [:edit, :update]

  def index
    @user = current_user
    if frontend_assets.enabled?
      render :index_react
    else
      @users = User.all
    end
  end

  def show
      @user = User.find(params[:id])
      @contents = @user.contents
      @mycontents_count = @user.contents.ids.count
  end

  def edit
  end

  def update
    if @user.update(user_params)
      flash[:success] = "#{@user} のプロフィールを編集が完了しました"
      redirect_to user_path(@user)
    else
      respond_to do |format|
        format.html { render :edit, status: :unprocessable_entity }
        format.json { render_validation_errors(@user) }
      end
    end
  end

  def following
      @user  = User.find(params[:id])
      @users = @user.followings
      render 'show_follow'
  end

  def followers
    @user  = User.find(params[:id])
    @users = @user.followers
    render 'show_follower'
  end

 private
  def user_params
    request_attributes(:user, :name, :avatar)
  end

  def set_editable_user
    @user = User.where(id: current_user.id).find(params[:id])
  end
end
