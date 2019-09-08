const { themePath, globalCompnentPath } = require('../constant');
const { getFinalConfig, getTheme } = require('../config');
const path = require('path');
const fs = require('fs');

const config = getFinalConfig();

module.exports = ({ stage, actions, loaders }) => {
  resolveLayouts(actions);
  setThemeColors(actions);
  setGlobalComponent(actions);

  if (stage === 'develop') {
    actions.setWebpackConfig({
      module: {
        rules: [
          {
            test: /react-hot-loader/,
            use: [loaders.js()]
          }
        ]
      }
    });
  }

  if (
    config.useCNDForLargeFiles &&
    stage !== 'build-html' &&
    process.env.NODE_ENV !== 'development'
  ) {
    const externals = {};
    config.largeFileList.forEach(file => {
      externals[file.name] = file.umdName;
    });

    actions.setWebpackConfig({
      externals
    });
  }
};

function componentExist(path) {
  return (
    fs.existsSync(path + '.js') ||
    fs.existsSync(path + '.jsx') ||
    fs.existsSync(path + '.ts') ||
    fs.existsSync(path + '.tsx')
  );
}

function getLayoutPath(layoutName) {
  const userDefinedLayout = path.resolve(process.cwd(), `${themePath}/${layoutName}`);
  if (componentExist(userDefinedLayout)) {
    return userDefinedLayout;
  } else {
    const { themeFullPath } = getTheme();
    return path.resolve(themeFullPath, 'layout');
  }
}

function resolveLayouts(actions) {
  const allLayouts = ['layout'];
  allLayouts.forEach(layout => {
    const layoutPath = getLayoutPath(layout);
    actions.setWebpackConfig({
      resolve: {
        alias: {
          [`rcpress-${layout}`]: layoutPath
        }
      }
    });
  });
}

function setThemeColors(actions) {
  const { themeColors } = config.themeConfig;

  if (themeColors) {
    actions.setWebpackConfig({
      module: {
        rules: [
          {
            test: /\.less$/,
            use: [
              {
                loader: 'less-loader', // compiles Less to CSS
                options: {
                  modifyVars: themeColors,
                  javascriptEnabled: true
                }
              }
            ]
          }
        ]
      }
    });
  }
}

function getGlobalComponentPath() {
  const compPath = path.resolve(process.cwd(), globalCompnentPath);
  if (componentExist(compPath)) {
    return compPath;
  } else {
    return path.resolve(__dirname, `../../src/globalComponent`);
  }
}

function setGlobalComponent(actions) {
  const compPath = getGlobalComponentPath();

  actions.setWebpackConfig({
    resolve: {
      alias: {
        'rcpress-g-component': compPath
      }
    }
  });
}
