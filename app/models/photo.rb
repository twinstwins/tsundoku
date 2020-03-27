class Photo < ApplicationRecord
  belongs_to :content
  mount_uploader :image, ImageUploader
end
