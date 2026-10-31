class AddSubmissionIdentityToContents < ActiveRecord::Migration[5.2]
  def change
    add_column :contents, :submission_key, :string, limit: 36
    add_column :contents, :submission_digest, :string, limit: 64
    add_index :contents, [:user_id, :submission_key], unique: true, name: 'index_contents_on_user_and_submission'
  end
end
