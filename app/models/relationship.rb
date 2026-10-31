class Relationship < ApplicationRecord
  belongs_to :following, class_name: "User"
  belongs_to :follower, class_name: "User"
  
  validates :follower_id, presence: true
  validates :following_id, presence: true
  validates :following_id, uniqueness: { scope: :follower_id }
  validate :different_users

  private

  def different_users
    errors.add(:following_id, '自分自身はフォローできません') if follower_id && follower_id == following_id
  end
end
