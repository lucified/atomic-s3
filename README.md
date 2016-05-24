
# Deploy projects 'atomically' to S3

A simple utility for deploying projects pseudo-atomically to Amazon S3. It first uploads assets that have content hashes, and only then uploads entry points assets like `index.html`. 

Assets that are not entry points are also assigned a `max-age` header.

## Install

```shell
npm install atomic-s3 -g
```

## Usage

The usage examples assume that necessary AWS credentials [are provided](http://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-configuring.html).

### Passing options via command line

```shell
atomic-s3 --path=dist --bucket=my-bucket-name --region=eu-west-1
```

### Passing options via configuration object

Create a file called `atomic-s3.config.js`.
```js
module.exports = {
  path: 'dist',
  s3options: {
    params: {
      'Bucket': 'my-bucket-name'
    }
    region: 'eu-west-1'
  }
};
```

Then simply run
```
atomic-s3
```

### Usage via Javascript

```js
import atomicS3 from 'atomic-s3';

var opts = {
  path: 'dist'
  s3options: {
    params: {
      'Bucket': 'my-bucket-name'
    }
    region: 'eu-west-1'
  }
};

atomicS3.publish(opts, (err, res) => {
  if (err) {
    console.log(`Publish failed: ${err}`);
    return;
  } 
  console.log('Project published.');
});
```

## Options

### Common options

- `path`: Local path to folder to publish. 
- `entryPoints`: List of node glob patterns that together match all assets that *are* entry points, i.e. assets that do not have content hashes. Defaults to `['**/*.html']`, which matches only html files.
- `maxAge`: Caching header to apply for assets that are not entry points. Defaults to `3600`.
- `force`: Disable cache.

### Options only for command line API

- `bucket`: Name of Amazon S3 bucket in which to publish. Required.
- `verbose` Set to true with `--verbose` enable verbose output.

### Options only for config object

- `path`: Local path to folder to publish. 
- `s3options`: [S3 options](<http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#constructor-property). The most important options are `region` and `params.Bucket`. (See usage example.)
