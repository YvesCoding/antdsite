const path = require('path');
const fs = require('fs-extra');
const { logger } = require('@rcpress/util');
const LoadablePlugin = require('@loadable/webpack-plugin');

module.exports = function createBaseConfig(
  {
    siteConfig,
    sourceDir,
    outDir,
    publicPath,
    themePath,
    themeLayoutPath,
    themeNotFoundPath,
    isAlgoliaSearch,
    markdown,
    cache
  },
  { debug } = {},
  isServer
) {
  const Config = require('webpack-chain');
  const CSSExtractPlugin = require('mini-css-extract-plugin');
  const cacheDirectory = '@rcpress/core/.temp';
  const isProd = process.env.NODE_ENV === 'production';
  const inlineLimit = 10000;
  const modulePaths = getModulePaths();
  const config = new Config();

  config
    .mode(isProd && !debug ? 'production' : 'development')
    .output.path(outDir)
    .filename(
      isProd
        ? 'assets/js/[name].[chunkhash:8].js'
        : 'assets/js/[name].js'
    )
    .publicPath(isProd ? publicPath : '/')
    .chunkFilename('[name].[hash:8]')
    .end();

  if (debug) {
    config.devtool('source-map');
  } else if (!isProd) {
    config.devtool('cheap-module-eval-source-map');
  }

  config.resolve.alias
    .set('@theme', themePath)
    .set('@themeLayout', themeLayoutPath)
    .set('@themeNotFound', themeNotFoundPath)
    .set('@source', sourceDir)
    .set('@temp', cacheDirectory)
    .set('@default-theme', '@rcpress/theme-default')
    .set(
      '@AlgoliaSearchBox',
      isAlgoliaSearch
        ? path.resolve(
            __dirname,
            '../default-theme/AlgoliaSearchBox.vue'
          )
        : path.resolve(__dirname, './noopModule.js')
    )
    .end()
    .extensions.merge([
      '.js',
      '.jsx',
      '.ts',
      '.tsx',
      '.less'
    ])
    .end()
    .modules.merge(modulePaths);

  config.resolveLoader
    .set('symlinks', true)
    .modules.merge(modulePaths);

  if (cache === false) {
    logger.tip('Clean cache...\n');
    fs.emptyDirSync(cacheDirectory);
  }

  const cacheIdentifier = JSON.stringify({
    rcpress: require('@rcpress/core/package.json').version,
    '@babel/core': require('@babel/core').version,
    isProd,
    isServer,
    config:
      (siteConfig.markdown
        ? JSON.stringify(siteConfig.markdown)
        : '') +
      (siteConfig.chainWebpack || '').toString() +
      (siteConfig.configureWebpack || '').toString()
  });

  const babelOption = {
    cacheDirectory,
    cacheIdentifier,
    presets: [
      ['@babel/preset-typescript'],
      ['@babel/preset-env'],
      ['@babel/preset-react']
    ],
    plugins: [
      [
        '@babel/plugin-proposal-decorators',
        { legacy: true }
      ],
      ['@babel/plugin-proposal-class-properties'],
      ['@babel/plugin-transform-regenerator']
    ]
  };

  const mdRule = config.module
    .rule('markdown')
    .test(/\.mdx?$/i);

  mdRule
    .use('babel-loader')
    .loader('babel-loader')
    .options(babelOption)
    .end()
    .use('markdownLoader')
    .loader(require.resolve('./markdownLoader'))
    .options({ sourceDir, markdown });

  config.module
    .rule('pug')
    .test(/\.pug$/)
    .use('pug-plain-loader')
    .loader('pug-plain-loader')
    .end();

  config.module
    .rule('js')
    .test(/\.(jsx?)|(tsx?)$/)
    .exclude.add(filepath => {
      // transpile rcpress
      if (/@rcpress/.test(filepath)) {
        return false;
      }

      // Don't transpile node_modules
      return /node_modules/.test(filepath);
    })
    .end()
    .use('babel-loader')
    .loader('babel-loader')
    .options(babelOption);

  config.module
    .rule('images')
    .test(/\.(png|jpe?g|gif)(\?.*)?$/)
    .use('url-loader')
    .loader('url-loader')
    .options({
      limit: inlineLimit,
      name: `assets/img/[name].[hash:8].[ext]`
    });

  // do not base64-inline SVGs.
  // https://github.com/facebookincubator/create-react-app/pull/1180
  config.module
    .rule('svg')
    .test(/\.(svg)(\?.*)?$/)
    .use('file-loader')
    .loader('file-loader')
    .options({
      name: `assets/img/[name].[hash:8].[ext]`
    });

  config.module
    .rule('media')
    .test(/\.(mp4|webm|ogg|mp3|wav|flac|aac)(\?.*)?$/)
    .use('url-loader')
    .loader('url-loader')
    .options({
      limit: inlineLimit,
      name: `assets/media/[name].[hash:8].[ext]`
    });

  config.module
    .rule('fonts')
    .test(/\.(woff2?|eot|ttf|otf)(\?.*)?$/i)
    .use('url-loader')
    .loader('url-loader')
    .options({
      limit: inlineLimit,
      name: `assets/fonts/[name].[hash:8].[ext]`
    });

  function createCSSRule(lang, test, loader, options) {
    const baseRule = config.module.rule(lang).test(test);
    const modulesRule = baseRule
      .oneOf('modules')
      .resourceQuery(/module/);
    const normalRule = baseRule.oneOf('normal');

    applyLoaders(modulesRule, true);
    applyLoaders(normalRule, false);

    function applyLoaders(rule, modules) {
      if (!isServer) {
        if (isProd) {
          rule
            .use('extract-css-loader')
            .loader(CSSExtractPlugin.loader);
        } else {
          rule.use('style-loader').loader('style-loader');
        }
      }

      rule
        .use('css-loader')
        .loader(
          isServer ? 'css-loader/locals' : 'css-loader'
        )
        .options({
          modules,
          localIdentName: `[local]_[hash:base64:8]`,
          importLoaders: 1,
          sourceMap: !isProd
        });

      rule
        .use('postcss-loader')
        .loader('postcss-loader')
        .options(
          Object.assign(
            {
              plugins: [require('autoprefixer')],
              sourceMap: !isProd
            },
            siteConfig.postcss
          )
        );

      if (loader) {
        rule
          .use(loader)
          .loader(loader)
          .options(options);
      }
    }
  }

  createCSSRule('css', /\.css$/);
  createCSSRule('postcss', /\.p(ost)?css$/);
  createCSSRule(
    'scss',
    /\.scss$/,
    'sass-loader',
    siteConfig.scss
  );
  createCSSRule(
    'sass',
    /\.sass$/,
    'sass-loader',
    Object.assign({ indentedSyntax: true }, siteConfig.sass)
  );
  createCSSRule(
    'less',
    /\.less$/,
    'less-loader',
    Object.assign(
      { javascriptEnabled: true },
      siteConfig.sass
    )
  );
  createCSSRule(
    'stylus',
    /\.styl(us)?$/,
    'stylus-loader',
    Object.assign(
      {
        preferPathResolver: 'webpack'
      },
      siteConfig.stylus
    )
  );

  if (isProd && !isServer) {
    config.plugin('extract-css').use(CSSExtractPlugin, [
      {
        filename: 'assets/css/styles.[chunkhash:8].css'
      }
    ]);

    // ensure all css are extracted together.
    // since most of the CSS will be from the theme and very little
    // CSS will be from async chunks
    config.optimization.splitChunks({
      cacheGroups: {
        styles: {
          name: 'styles',
          // necessary to ensure async chunks are also extracted
          test: m => /css-extract/.test(m.type),
          chunks: 'all',
          enforce: true
        }
      }
    });
  }

  // inject constants
  config
    .plugin('injections')
    .use(require('webpack/lib/DefinePlugin'), [
      {
        BASE_URL: JSON.stringify(siteConfig.base || '/'),
        GA_ID: siteConfig.ga
          ? JSON.stringify(siteConfig.ga)
          : false,
        SW_ENABLED: !!siteConfig.serviceWorker,
        RCPRESS_VERSION: JSON.stringify(
          require('@rcpress/core/package.json').version
        ),
        LAST_COMMIT_HASH: JSON.stringify(
          getLastCommitHash()
        )
      }
    ]);

  // loadable webpack plugin
  config.plugin('LoadablePlugin').use(new LoadablePlugin());

  return config;
};

function getLastCommitHash() {
  const spawn = require('cross-spawn');
  let hash;
  try {
    hash = spawn
      .sync('git', ['log', '-1', '--format=%h'])
      .stdout.toString('utf-8')
      .trim();
  } catch (error) {}
  return hash;
}

function getModulePaths() {
  return module.paths.concat([
    path.resolve(process.cwd(), 'node_modules'),
    './node_modules'
  ]);
}
