FactoryBot.define do
  factory :user do
    sequence(:email) { |n| "tester#{n}@example.com" }
    password "password"
    name "Elizabeth"
  end
end
