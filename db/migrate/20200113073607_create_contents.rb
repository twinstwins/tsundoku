class CreateContents < ActiveRecord::Migration[5.2]
  def change
    create_table :contents do |t|
      t.string :name, null: false
      t.string :genre_id

      t.timestamps
    end
  end
end
