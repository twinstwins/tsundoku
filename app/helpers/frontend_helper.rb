module FrontendHelper
  def frontend_asset_tags
    assets = frontend_assets
    return unless assets.enabled?
    script_options = { type: 'module', 'data-turbolinks-track': 'reload' }
    if assets.development?
      origin = assets.development_origin
      preamble = <<~JS
        import RefreshRuntime from #{(origin + '/@react-refresh').to_json};
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => (type) => type;
        window.__vite_plugin_react_preamble_installed__ = true;
      JS
      safe_join([
        javascript_tag(preamble, type: 'module', nonce: true),
        javascript_include_tag(origin + '/@vite/client', script_options),
        javascript_include_tag(origin + '/' + FrontendAssets::ENTRY, script_options)
      ])
    else
      bundle = assets.bundle
      tags = bundle[:stylesheets].map { |file| stylesheet_link_tag(file, 'data-turbolinks-track': 'reload') }
      tags.concat(bundle[:preloads].map { |file| tag.link(rel: 'modulepreload', href: file, crossorigin: 'anonymous') })
      tags << javascript_include_tag(bundle[:script], script_options)
      safe_join(tags)
    end
  end
end
