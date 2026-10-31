require 'digest'
require 'json'

class ContentSubmission
  MAX_IMAGE_BYTES = 5 * 1024 * 1024
  IMAGE_TYPES = { 'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif' }.freeze
  IMAGE_ERROR = '画像を読み込めませんでした。JPEG・PNG・GIFの画像を選び直してください'.freeze
  KEY_PATTERN = /\A[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/
  Result = Struct.new(:content, :created, :fields, :conflict)

  def initialize(user, key, input)
    @user, @key, @input = user, key, input
  end

  def call
    fields = input_errors
    return Result.new(nil, false, fields, false) unless fields.empty?
    fingerprint = Digest::SHA256.hexdigest(JSON.generate([
      @input[:name], @input[:description],
      image && [image.original_filename, image.content_type, Digest::SHA256.file(image.tempfile.path).hexdigest]
    ]))
    @user.with_lock do
      existing = @user.contents.find_by(submission_key: @key)
      if existing
        return Result.new(existing, false, {}, existing.submission_digest != fingerprint)
      end
      content = @user.contents.build(name: @input[:name], description: @input[:description],
                                     submission_key: @key, submission_digest: fingerprint)
      content.photos.build(image: safe_upload) if image
      if content.save
        Result.new(content, true, {}, false)
      else
        errors = content.errors.to_hash.each_with_object({}) do |(field, messages), result|
          key = field.to_s.start_with?('photos') ? 'image' : field.to_s
          result[key] = key == 'image' ? [IMAGE_ERROR] : (result[key] || []) + messages
        end
        Result.new(nil, false, errors, false)
      end
    end
  end

  private

  def image
    @input[:image]
  end

  def input_errors
    errors = {}
    [:name, :description].each do |field|
      text = @input[field]
      if !text.is_a?(String) || !text.valid_encoding?
        errors[field] = ['文字列で入力してください']
      elsif text.match?(/[\u{10000}-\u{10FFFF}]/)
        errors[field] = ['現在この文字は保存できません。絵文字などを除いてください']
      end
    end
    if @input[:description].is_a?(String) && @input[:description].bytesize > 65_535
      errors[:description] = ['説明が長すぎます。短くしてください']
    end
    if image
      if !image.is_a?(ActionDispatch::Http::UploadedFile)
        errors[:image] = ['画像ファイルを選択してください']
      elsif image.size > MAX_IMAGE_BYTES
        errors[:image] = ['画像は5MB以下にしてください']
      elsif !IMAGE_TYPES.key?(image.content_type)
        errors[:image] = ['JPEG・PNG・GIFの画像を選択してください']
      elsif !image.original_filename.is_a?(String) || !image.original_filename.valid_encoding? || !%w[.jpg .jpeg .gif .png].include?(File.extname(image.original_filename).downcase)
        errors[:image] = ['JPEG・PNG・GIFのファイル名を指定してください']
      elsif !supported_image_signature?
        errors[:image] = [IMAGE_ERROR]
      end
    end
    errors
  end

  def supported_image_signature?
    header = File.binread(image.tempfile.path, 12)
    case image.content_type
    when 'image/png' then header.start_with?("\x89PNG\r\n\x1A\n".b)
    when 'image/jpeg' then header.start_with?("\xFF\xD8\xFF".b)
    when 'image/gif' then header.start_with?('GIF87a', 'GIF89a')
    end
  end

  def safe_upload
    ActionDispatch::Http::UploadedFile.new(tempfile: image.tempfile, type: image.content_type,
                                           filename: "image.#{IMAGE_TYPES.fetch(image.content_type)}")
  end
end
