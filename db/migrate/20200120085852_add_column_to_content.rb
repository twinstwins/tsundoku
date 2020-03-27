class AddColumnToContent < ActiveRecord::Migration[5.2]
  def change
    add_column :contents, :description, :text
  end
end
