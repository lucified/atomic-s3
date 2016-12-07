#! /usr/bin/env node

/* eslint-disable no-console */

const fileExists = require('file-exists');
const path = require('path');
const chalk = require('chalk');
const minimist = require('minimist');
const Table = require('cli-table2');
const _ = require('lodash');

const atomicS3 = require('./main');
const prepareOptions = require('./prepare-options');
const validateOptions = require('./validate-options');

const args = minimist(process.argv.slice(2));
const configFile = args.config || 'atomic-s3.config.js';
const hrstart = process.hrtime();

// merge options from possible config file with command line arguments
let opts = {};
if (fileExists(configFile)) {
  const resolvedPath = path.resolve(configFile);
  if (args.verbose) {
    console.log(`Using config from ${chalk.blue(resolvedPath)}`);
  }
  opts = require(resolvedPath); // eslint-disable-line
} else if (args.config) {
  console.log(`[Error] ${configFile} does not exist`);
  process.exit(1);
}

if (!opts.s3options) {
  opts.s3options = {};
}
if (!opts.s3options.params) {
  opts.s3options.params = {};
}

if (args.bucket) {
  opts.s3options.params.Bucket = args.bucket;
}
if (args.region) {
  opts.s3options.region = args.region;
}
if (args.path) {
  opts.path = args.path;
}

// check that options are valid
opts = prepareOptions(opts);
const errors = validateOptions(opts);
if (errors) {
  console.log(chalk.red('Error: invalid options'));
  _.forEach(errors, msg => {
    console.log(`  ${msg}`);
  });
  process.exit(1);
}

if (!args.silent) {
  console.log(`${chalk.cyan('▶')} Uploading to S3`);
}

if (args.verbose) {
  const table = new Table();
  table.push({ path: opts.path });
  table.push({ bucket: opts.s3options.params.Bucket });
  table.push({ region: opts.s3options.region });
  table.push({ entryPoints: opts.entryPoints.join(',') });
  console.log(table.toString());
}

atomicS3.publish(opts, err => {
  if (err) {
    console.log(`${chalk.red('[Error]')} ${err}`);
    process.exit(1);
  }
  if (!args.silent) {
    console.log(`${chalk.green('✓')} ` // eslint-disable-line prefer-template
      + 'Finished S3 upload in '
      + chalk.magenta(`${(process.hrtime(hrstart)[1] / 1000000).toFixed(2)} ms`));
  }
});
