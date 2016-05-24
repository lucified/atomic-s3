
const deepcopy = require('deepcopy');

function prepareOptions(options) {
  const opts = deepcopy(options);
  opts.entryPoints = opts.entryPoints || ['**/*.html'];
  return opts;
}

module.exports = prepareOptions;
