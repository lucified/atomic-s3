
module.exports = {
  path: 'test/dist',
  s3options: {
    params: {
      Bucket: 'lucify-test-bucket',
    },
    region: 'eu-west-1',
  },
};
