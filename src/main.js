
const awspublish = require('gulp-awspublish');
const del = require('del');
const vfs = require('vinyl-fs');
const path = require('path');
const through2 = require('through2').obj;
const merge2 = require('merge2');

const prepareOptions = require('./prepare-options');
const validateOptions = require('./validate-options');

/*
 * Get publishStream for publishing files AWS with given
 * headers, and a related awspublish reporter stream
 */
function prepareStreams(publisher, simulate, force) {
  if (force) {
    del.sync('./.awspublish-*');
  }

  const bucket = publisher.config.params.Bucket;

  // Config object is passed to
  // new AWS.S3() as documented here:
  //   http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#constructor-property

  // We want to construct a pipeline that consists of multiple segments piped together.
  // The consumer of this pipeline needs to be able to pipe into its first segment
  // and to maybe continue it, i.e. to access its last segment. So we're returning
  // an array with the first and last segments of this pipeline.

  const publishStream = publisher.publish({ 'x-amz-acl': 'private' }, {
    force,
    simulate: simulate === true,
  });
  let cache = null;
  if (!force) {
    cache = publishStream.pipe(publisher.cache());
  }
  let reporterStream = awspublish.reporter();
  if (simulate === true) {
    reporterStream = through2((file, _enc, cb) => {
      console.log(`s3://${bucket}/${file.s3.path}`); // eslint-disable-line
      console.log(file.s3.headers); // eslint-disable-line
      cb(null, file);
    });
  }
  (cache || publishStream).pipe(reporterStream);
  return { publishStream, reporterStream };
}

//
// https://github.com/jussi-kalliokoski/gulp-awspublish-router/blob/master/lib/utils/initFile.js
//
function s3Init(file, s3Folder) {
  if (file.s3) {
    return;
  }
  file.s3 = {};               // eslint-disable-line no-param-reassign
  file.s3.headers = {};       // eslint-disable-line no-param-reassign
  file.s3.path = file.path    // eslint-disable-line no-param-reassign
    .replace(file.base, s3Folder || '')
    .replace(new RegExp(`\\${path.sep}`, 'g'), '/');
}

/*
 * Get file streams for all entry points assets
 * (assets without rev urls)
 */
function entryPointStream(sourceFolder, entryPoints, s3Folder, gzip) {
  return vfs.src(entryPoints, {
    cwd: sourceFolder || 'dist',
  })
  .pipe(through2((file, _enc, cb) => {
    s3Init(file, s3Folder);
    cb(null, file);
  }))
  .pipe(gzip ? awspublish.gzip({ ext: '' }) : through2());
}


/*
 * Get file streams for all hashed assets
 * (assets with rev urls)
 *
 * targetFolder -- folder to publish into
 * maxAge -- expiry age for header
 */
function assetStream(sourceFolder, entryPoints, maxAge, s3Folder, patterns, gzip) {
  if (maxAge === null || !isFinite(maxAge)) {
    maxAge = 3600; // eslint-disable-line no-param-reassign
  }

  const headers = {
    'Cache-Control': `max-age=${maxAge}, public`,
  };

  // Select everything BUT the entrypoints
  let src = entryPoints.map(f => `!${f}`);
  src = (patterns || ['**/*.*']).concat(src);

  return vfs.src(src, {
    cwd: sourceFolder || 'dist',
  })
  .pipe(through2((file, _enc, cb) => {
    s3Init(file, s3Folder);
    Object.assign(file.s3.headers, headers);
    cb(null, file);
  }))
  .pipe(gzip ? awspublish.gzip({ ext: '' }) : through2());
}

/*
 * Publish given streams in series and return
 * related awspublish reporter stream
 */
function publishInSeries(streams, opts) {
  const combinedStream = merge2(...streams);

  const publisher = awspublish.create(opts.s3options);
  const { publishStream, reporterStream } = prepareStreams(
    publisher,
    opts.simulateDeployment || false,
    opts.forceDeployment || false
  );

  combinedStream.pipe(publishStream);
  return reporterStream;
}

function publish(options, cb) {
  const opts = prepareOptions(options);
  const errors = validateOptions(opts);
  if (errors) {
    throw (Error(errors));
  }

  const compressedAssets = assetStream(opts.path, opts.entryPoints, opts.maxAge, '', ['**/*.js', '**/*.json', '**/*.css', '**/*.svg'], true);
  const assets = assetStream(opts.path, opts.entryPoints, opts.maxAge, '', ['**/*.*', '!**/*.js', '!**/*.json', '!**/*.css', '!**/*.svg'], false);
  const entry = entryPointStream(opts.path, opts.entryPoints, '', true);

  // It is important to do deploy in series to
  // achieve an "atomic" update. uploading index.html
  // before hashed assets would be bad -- JOJ

  publishInSeries([compressedAssets, assets, entry], opts)
    .on('end', () => { cb(false); })
    .on('error', err => { cb(err); });
}

module.exports = {
  entryPointStream,
  assetStream,
  prepareStreams,
  publishInSeries,
  publish,
  s3Init,
};
