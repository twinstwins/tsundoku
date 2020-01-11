require 'rails_helper'

RSpec.describe User, type: :model do
  it "has a valid factory" do
    expect(FactoryBot.create(:user)).to be_valid
  end

  it "double test" do
    user = User.new(
    name: "Elizabeth",
    email: "elizabeth@gmail.com",
    password: "password",
  )
    expect(user).to be_valid
  end

  it "truthy true" do
    expect(1+1).to eq 2
  end
end
