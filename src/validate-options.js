
function validateOptions(opts) {
  const errors = [];

  if (!opts) {
    errors.push('No options defined');
  }

  if (!opts.path && opts.path !== '') {
    errors.push('path must be defined');
  }

  if (!opts.s3options) {
    errors.push('s3options must be defined');
  }

  if (opts.s3options && !opts.s3options.params) {
    errors.push('s3options.params is not defined');
  }

  if (opts.s3options && opts.s3options.params && !opts.s3options.params.Bucket) {
    errors.push('bucket is not defined (should be defined via command line '
      + 'option --bucket or s3options.params.Bucket)');
  }

  if (!opts.s3options.region) {
    errors.push('region is not defined (should be defined via command line '
      + 'or s3options.params.region)');
  }

  if (errors.length === 0) {
    return false;
  }
  return errors;
}

module.exports = validateOptions;
