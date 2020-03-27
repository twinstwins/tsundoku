class UsersController < ApplicationController

  def index
    @users = User.all
    @user = current_user
  end

  def show
      @user = User.find_by(id: params[:id])
      @contents = @user.contents
      @mycontents_count = @user.contents.ids.count
  end

  def edit
    @user = User.find(params[:id])
  end

  def update
    @user = User.find(params[:id])
    if @user.update(user_params)
      flash[:success] = "#{@user} のプロフィールを編集が完了しました"
      redirect_to user_path(@user)
    else
      render :edit
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
    params.require(:user).permit(:name, :email, :password, :password_confirmation,:avatar)
  end

  def set_user
   @user = User.find(params[:id])
  end
end
