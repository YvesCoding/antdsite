const chalk = require('chalk');
const commander = require('commander');
const os = require('os');
const path = require('path');
const execSync = require('child_process').execSync;
const packageJson = require('./package.json');
const fs = require('fs-extra');
const validateProjectName = require('validate-npm-package-name');
const spawn = require('cross-spawn');
const ejectTheme = require('./eject');

let projectName;

const allDeps = {
  antdsite: 'latest',
  gatsby: '^2.13.45',
  react: '^16.8.0',
  'react-dom': '^16.8.0'
};

// These files should be allowed to remain on a failed install,
// but then silently removed during the next create.
const errorLogFilePatterns = [
  'npm-debug.log',
  'yarn-error.log',
  'yarn-debug.log'
];

const program = new commander.Command(packageJson.name)
  .version(packageJson.version)
  .arguments('[project-directory]')
  .usage(`${chalk.green('[project-directory]')}`)
  .action(name => {
    projectName = name;
  })
  .option(
    '--use-npm',
    'use npm to download packages instead of yarn, defaults to yarn'
  )
  .option('--eject', 'copy the default theme to current working directory.')
  .parse(process.argv);

createApp(projectName, program.useNpm, program.eject);

function printValidationResults(results) {
  if (typeof results !== 'undefined') {
    results.forEach(error => {
      console.error(chalk.red(`  *  ${error}`));
    });
  }
}

function checkAppName(appName) {
  const validationResult = validateProjectName(appName);
  if (!validationResult.validForNewPackages) {
    console.error(
      `Could not create a project called ${chalk.red(
        `"${appName}"`
      )} because of npm naming restrictions:`
    );
    printValidationResults(validationResult.errors);
    printValidationResults(validationResult.warnings);
    process.exit(1);
  }

  // TODO: there should be a single place that holds the dependencies
  const dependencies = Object.keys(allDeps).sort();
  if (dependencies.indexOf(appName) >= 0) {
    console.error(
      chalk.red(
        `We cannot create a project called ${chalk.green(
          appName
        )} because a dependency with the same name exists.\n` +
          `Due to the way npm works, the following names are not allowed:\n\n`
      ) +
        chalk.hex('#29CDFF')(
          dependencies.map(depName => `  ${depName}`).join('\n')
        ) +
        chalk.red('\n\nPlease choose a different project name.')
    );
    process.exit(1);
  }
}

function shouldUseYarn() {
  try {
    execSync('yarnpkg --version', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

function executeNodeScript({ cwd, initScriptPath }, data, source) {
  return new Promise(resolve => {
    const child = spawn(
      process.execPath,
      ['-e', source, '--', JSON.stringify(data), initScriptPath],
      { cwd, stdio: 'inherit' }
    );

    child.on('close', code => {
      if (code !== 0) {
        return;
      }
      resolve();
    });
  });
}

// If project only contains files generated by GH, it’s safe.
// Also, if project contains remnant error logs from a previous
// installation, lets remove them now.
// We also special case IJ-based products .idea because it integrates with CRA:
// https://github.com/facebook/create-react-app/pull/368#issuecomment-243446094
function isSafeToCreateProjectIn(root, name) {
  const validFiles = [
    '.git',
    '.gitignore',
    'README.md',
    'LICENSE',
    '.npmignore',
    '.gitattributes'
  ];
  console.log();

  const conflicts = fs
    .readdirSync(root)
    .filter(file => !validFiles.includes(file))
    // IntelliJ IDEA creates module files before CRA is launched
    .filter(file => !/\.iml$/.test(file))
    // Don't treat log files from previous installation as conflicts
    .filter(
      file => !errorLogFilePatterns.some(pattern => file.indexOf(pattern) === 0)
    );

  if (conflicts.length > 0) {
    console.log(
      `The directory ${chalk.green(name)} contains files that could conflict:`
    );
    console.log();
    for (const file of conflicts) {
      console.log(`  ${file}`);
    }
    console.log();
    console.log(
      'Either try using a new directory name, or remove the files listed above.'
    );

    return false;
  }

  // Remove any remnant files from a previous installation
  const currentFiles = fs.readdirSync(path.join(root));
  currentFiles.forEach(file => {
    errorLogFilePatterns.forEach(errorLogFilePattern => {
      // This will catch `(npm-debug|yarn-error|yarn-debug).log*` files
      if (file.indexOf(errorLogFilePattern) === 0) {
        fs.removeSync(path.join(root, file));
      }
    });
  });
  return true;
}

function createApp(name = './', useNpm, eject) {
  const root = path.resolve(name);
  const appName = path.basename(root);
  const originalDirectory = process.cwd();

  if (eject) {
    return ejectTheme(root);
  }

  checkAppName(appName);
  fs.ensureDirSync(name);
  if (!isSafeToCreateProjectIn(root, appName)) {
    process.exit(1);
  }

  console.log(`Creating a new antd site in ${chalk.green(root)}.`);
  console.log();

  const useYarn = useNpm ? false : shouldUseYarn();
  const packageJson = {
    name: appName,
    version: '0.1.0',
    private: true,
    scripts: {
      build: `${useYarn ? 'yarn' : 'npm run'} clean && gatsby build`,
      start: `${useYarn ? 'yarn' : 'npm run'} clean && gatsby develop`,
      eject: 'antdsite-cli --eject',
      clean: 'gatsby clean'
    },
    dependencies: {
      ...allDeps
    }
  };
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify(packageJson, null, 2) + os.EOL
  );

  const antsiteConfig = `module.exports = {
  title: '${appName}',
  description: 'My first antdsite app',
  logo: '/favicon.png',
  head: [['link', { rel: 'icon', href: '/favicon.png' }]],
  themeConfig: {
    nav: [
      {
        text: 'Guide',
        link: '/guide'
      },
      {
        text: 'GitHub',
        link: 'https://github.com/YvesCoding/antdsite',
        important: true
      }
    ],
    sidebar: {
      '/guide/': [
        'page1',
        {
          title: 'page2',
          collapsable: true,
          children: ['page2']
        },
        {
          title: 'page3',
          collapsable: false,
          children: ['page3']
        }
      ]
    }
  }
};`;
  fs.ensureDirSync(path.resolve(root, '.antdsite'));
  fs.writeFileSync(
    path.join(root, '.antdsite/config.js'),
    antsiteConfig + os.EOL
  );

  process.chdir(root);

  const dependencies = Object.keys(allDeps).reduce((pre, cur) => {
    return pre.concat(cur + '@' + allDeps[cur]);
  }, []);

  run(root, dependencies, useYarn, appName, originalDirectory);
}

function run(root, dependencies, useYarn, appName, originalDirectory) {
  console.log(`Installing ${chalk.hex('#29CDFF')(dependencies.join(' '))} ...`);
  install(root, useYarn, dependencies).then(() => {
    const initScriptPath = path.resolve(__dirname, 'init.js');

    executeNodeScript(
      {
        cwd: process.cwd(),
        initScriptPath
      },
      [root, appName, useYarn, originalDirectory],
      `
    var init = require(process.argv[2]);
    init.apply(null, JSON.parse(process.argv[1]));
  `
    );
  });
}

function install(root, useYarn, dependencies) {
  return new Promise((resolve, reject) => {
    let command;
    let args;
    if (useYarn) {
      command = 'yarnpkg';
      args = ['add', '--exact'];

      [].push.apply(args, dependencies);

      // Explicitly set cwd() to work around issues like
      // https://github.com/facebook/create-react-app/issues/3326.
      // Unfortunately we can only do this for Yarn because npm support for
      // equivalent --prefix flag doesn't help with this issue.
      // This is why for npm, we run checkThatNpmCanReadCwd() early instead.
      args.push('--cwd');
      args.push(root);
    } else {
      command = 'npm';
      args = [
        'install',
        '--save',
        '--save-exact',
        '--loglevel',
        'error'
      ].concat(dependencies);
    }

    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('close', code => {
      if (code !== 0) {
        reject({
          command: `${command} ${args.join(' ')}`
        });
        return;
      }
      resolve();
    });
  });
}
