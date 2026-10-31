Rails.application.routes.draw do
  namespace :api, defaults: { format: :json } do
    namespace :v1 do
      resource :me, only: :show, controller: 'me'
      resources :users, only: [:index, :show] do
        member do
          get :following, :followers, :contents
        end
      end
      resources :contents, only: [:index, :show]
    end
  end
  devise_for :users, :controllers => {
    :registrations => 'users/registrations',
    :sessions => 'users/sessions'
  }
  # For details on the DSL available within this file, see http://guides.rubyonrails.org/routing.html
  root to: 'users#index'

  resources :contents, only: [:new,:create,:index,:show] do
    resources :photos, only: [:create]
    resources :likes, only: [:create, :destroy]
    resources :comments, only: [:create, :destroy]
  end

#userリソースに対する、/:id/following, /:id/followers　のルーティングを定義
#memberは、users/:id/xxxx となり、 collectは、 users/xxx となる
  resources :users, only: [:index, :show, :edit, :update] do
    member do
     get :following, :followers
    end
  end
  resources :relationships,       only: [:create, :destroy]
end
