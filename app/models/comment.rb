class Comment < ApplicationRecord
  belongs_to :user
  belongs_to :content
  validates :user_id, uniqueness: { scope: :content_id }
end
