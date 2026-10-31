require 'json'
require 'uri'
require 'set'

class FrontendAssets
  ENTRY = 'src/entrypoints/application.tsx'.freeze
  FEATURES = { users: 'REACT_USERS_ENABLED', content: 'REACT_CONTENT_DETAIL_ENABLED', profile: 'REACT_PROFILE_ENABLED' }.freeze
  InvalidManifest = Class.new(StandardError)

  def initialize(root: Rails.root, env: ENV, development: Rails.env.development?)
    @root, @env, @development = Pathname.new(root), env, development
  end

  def enabled?(page = nil)
    flags = page ? [FEATURES.fetch(page)] : FEATURES.values
    return false unless flags.any? { |flag| @env[flag] == '1' }
    return !!development_origin if @development && @env['VITE_DEV_SERVER_URL'].present?
    !!bundle
  end

  def development?
    !!development_origin
  end

  def development_origin
    return @development_origin if defined?(@development_origin)
    @development_origin = nil
    return unless @development && @env['VITE_DEV_SERVER_URL'].present?
    uri = URI.parse(@env['VITE_DEV_SERVER_URL'])
    if %w[http https].include?(uri.scheme) && uri.host && !uri.userinfo && !uri.query && !uri.fragment && ['', '/'].include?(uri.path)
      @development_origin = uri.to_s.sub(%r{/$}, '')
    end
    @development_origin
  rescue URI::InvalidURIError
    nil
  end

  def bundle
    return @bundle if defined?(@bundle)
    @bundle = nil
    manifest = JSON.parse(File.read(@root.join('public/frontend/.vite/manifest.json')))
    raise InvalidManifest unless manifest.is_a?(Hash) && manifest.fetch(ENTRY).fetch('isEntry') == true
    visited, stylesheets, preloads = Set.new, [], []
    visit = lambda do |key|
      return if visited.include?(key)
      visited << key
      node = manifest.fetch(key)
      raise InvalidManifest unless node.is_a?(Hash)
      imports, css = node.fetch('imports', []), node.fetch('css', [])
      raise InvalidManifest unless imports.is_a?(Array) && imports.all? { |value| value.is_a?(String) } && css.is_a?(Array)
      imports.each { |import| visit.call(import) }
      stylesheets.concat(css.map { |file| asset_path(file, '.css') })
      preloads << asset_path(node.fetch('file'), '.js') unless key == ENTRY
    end
    visit.call(ENTRY)
    @bundle = { script: asset_path(manifest.fetch(ENTRY).fetch('file'), '.js'), stylesheets: stylesheets.uniq, preloads: preloads.uniq }
  rescue SystemCallError, JSON::ParserError, KeyError, TypeError, NoMethodError, InvalidManifest => error
    Rails.logger.warn("Frontend assets unavailable; using ERB (#{error.class})")
    @bundle = nil
  end

  private

  def asset_path(file, extension)
    unless file.is_a?(String) && file.match?(/\Aassets\/[A-Za-z0-9._\/-]+\z/) && file.end_with?(extension) && !file.split('/').include?('..') && @root.join('public/frontend', file).file?
      raise InvalidManifest
    end
    "/frontend/#{file}"
  end
end
