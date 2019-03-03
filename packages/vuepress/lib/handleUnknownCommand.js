'use strict'

/**
 * Module dependencies.
 */

const prepare = require('@vuepress/core/lib/prepare')
const { path, logger, globby, chalk } = require('@vuepress/shared-utils')
const { isKnownCommand, CLI } = require('./util')
const pwd = process.cwd()

/**
 * Expose handleUnknownCommand function.
 */

module.exports = async function (cli, options) {
  registerUnknownCommands(cli, options)

  const argv = process.argv.slice(2)
  const inferredUserDocsDirectory = await inferUserDocsDirectory(pwd)
  logger.developer('inferredUserDocsDirectory', inferredUserDocsDirectory)

  const needPrepareBeforeLaunchCLI = inferredUserDocsDirectory
    && (isHelpFlag(argv[0]) || isUnknownCommandHelp(argv))

  logger.developer('needPrepareBeforeLaunchCLI', needPrepareBeforeLaunchCLI)

  if (needPrepareBeforeLaunchCLI) {
    let context
    let [, sourceDir] = argv

    if (!sourceDir || sourceDir.startsWith('-')) {
      sourceDir = inferredUserDocsDirectory
    } else {
      sourceDir = pwd
    }

    logger.setOptions({ logLevel: 1 })

    if (sourceDir) {
      context = await prepare({ sourceDir, ...options })
      context.pluginAPI.options.extendCli.apply(cli, context)
    }

    logger.setOptions({ logLevel: 3 })
  }
}

// When user type `vuepress [customCommand] --help`,
// VuePress will try to detect where user to place docs.

async function inferUserDocsDirectory (cwd) {
  const paths = await globby([
    '**/.vuepress/config.js',
    '!node_modules'
  ], {
    cwd,
    dot: true
  })
  const siteConfigPath = paths && paths[0]
  if (siteConfigPath) {
    return path.resolve(
      cwd,
      siteConfigPath.replace('.vuepress/config.js', '')
    )
  }
  return null
}

/**
 * Register a command to match all unmatched commands
 * @param {CAC} cli
 */

function registerUnknownCommands (cli, options) {
  cli.on('command:*', async () => {
    const { args, options: commandoptions } = cli

    logger.debug('global_options', options)
    logger.debug('cli_options', commandoptions)
    logger.debug('cli_args', args)

    const [commandName] = args
    const sourceDir = args[1] ? path.resolve(args[1]) : pwd
    const inferredUserDocsDirectory = await inferUserDocsDirectory(pwd)
    logger.developer('inferredUserDocsDirectory', inferredUserDocsDirectory)
    logger.developer('sourceDir', sourceDir)

    if (inferredUserDocsDirectory && sourceDir !== inferredUserDocsDirectory) {
      logUnknownCommand(cli)
      console.log()
      logger.tip(`Did you miss to specify the target docs dir? e.g. ${chalk.cyan(`vuepress ${commandName} [targetDir]`)}.`)
      logger.tip(`A custom command registered by a plugin requires VuePress to locate your site configuration like ${chalk.cyan('vuepress dev')} or ${chalk.cyan('vuepress build')}.`)
      console.log()
      process.exit(1)
    }

    if (!inferredUserDocsDirectory) {
      logUnknownCommand(cli)
      process.exit(1)
    }

    logger.debug('Custom command', chalk.cyan(commandName))
    CLI({
      async beforeParse (subCli) {
        const context = await prepare(sourceDir, {
          ...options,
          ...commandoptions
        }, false /* isProd */)
        await context.pluginAPI.options.extendCli.apply(subCli, context)
      },
      async afterParse (subCli) {
        if (!subCli.matchedCommand) {
          logUnknownCommand(subCli)
          console.log()
        }
      }
    })
  })
}

function isHelpFlag (v) {
  return v === '--help' || v === '-h'
}

function isUnknownCommandHelp (argv) {
  return !isKnownCommand(argv) && isHelpFlag(argv[1])
}

function logUnknownCommand (cli) {
  console.error('Unknown command: %s', cli.args.join(' '))
}

