/* global describe it */

const expect = require('chai').expect;
const es = require('event-stream');
const s3 = require('../src/main');
const through2 = require('through2').obj;
const AWS = require('aws-sdk');
const _ = require('lodash');
const Rx = require('rxjs');

AWS.config.update({ region: process.env.AWS_REGION || 'eu-west-1' });

const entryPoints = [
  '**/*.html',
  '**/resize.js',
  '**/embed.js',
  '*.{png,ico}',
];
const inspect = (obj) => console.dir(obj, { depth: 5, color: true }); // eslint-disable-line

function cleanBucket(bucket, cb) {
  const awsS3 = new AWS.S3();
  awsS3.listObjects({ Bucket: bucket }, (err, data) => {
    function del(keys, cb2) {
      awsS3.deleteObjects({ Bucket: bucket, Delete: { Objects: keys } }, (err2, data2) => {
        if (err2) {
          cb(err);
          return;
        }
        console.log(`Deleted ${data2.Deleted.length} files from ${bucket}`); // eslint-disable-line
        cb2();
      });
    }
    if (err) {
      cb(err);
      return;
    }
    const keys = data.Contents.map(f => _.pick(f, 'Key'));
    if (keys.length > 0) {
      del(keys, cb);
    } else {
      cb();
    }
  });
}

function uploadAndReturnPaths(bucket, streams, done) {
  const opt = {
    simulateDeployment: false,
    forceDeployment: true,
    s3options: {
      params: {
        Bucket: bucket,
      },
    },
  };

  const combinedStream = s3.publishInSeries(streams, opt);

  const files = [];
  return combinedStream
    .pipe(through2((f, _enc, cb) => {
      expect(f.s3).to.exist;
      files.push(f);
      cb(null, f);
    }, () => {
      try {
        done(undefined, files);
      } catch (err) {
        done(err);
      }
    }));
}

function assertS3(files, bucket, done) {
  const awsS3 = new AWS.S3();
  awsS3.listObjects({ Bucket: bucket }, (err, data) => {
    if (err) {
      return done(err);
    }
    const diff = _.differenceWith(files, data.Contents, (local, remote) => local.s3.path === remote.Key);
    if (diff.length > 0) {
      inspect(files);
      inspect(data.Contents);
      return done(new Error('No match'));
    }
    return Rx.Observable.from(data.Contents)
      .map(s3File => ({ Bucket: bucket, Key: s3File.Key }))
      .mergeMap(params =>
          Rx.Observable.bindNodeCallback(awsS3.headObject.bind(awsS3, params))()
            .map(x => Object.assign(x, params))
      , 4)
      .toArray()
      .subscribe(fullFiles => done(undefined, fullFiles), done);
  });
}


describe('entrypoint-stream', () => {
  it('contains the entrypoints', done => {
    s3.entryPointStream('test/dist', entryPoints)
      .pipe(es.writeArray((err, files) => {
        expect(err).not.to.exist;
        expect(files).to.have.length(7);
        done();
      }));
  });
});

describe('asset-stream', () => {
  it('contains everything else', done => {
    s3.assetStream('test/dist', entryPoints)
      .pipe(es.writeArray((err, files) => {
        expect(err).not.to.exist;
        expect(files).to.have.length(6);
        done();
      }));
  });
  it('can compress', done => {
    s3.assetStream('test/dist', entryPoints, undefined, undefined, ['**/*.js'], true)
      .pipe(es.writeArray((err, files) => {
        expect(err).not.to.exist;
        expect(files).to.have.length(2);
        expect(files[0].s3.headers['Content-Encoding']).to.eq('gzip');
        done();
      }));
  });
});

describe('publish-stream', () => {
  it('contains everything in correct order', done => {
    const entries = [];
    const eStream = s3.entryPointStream('test/dist', entryPoints)
      .pipe(through2((f, _e, cb) => {
        entries.push(f);
        cb(null, f);
      }));
    const assets = [];
    const aStream = s3.assetStream('test/dist', entryPoints)
      .pipe(through2((f, _e, cb) => {
        assets.push(f);
        cb(null, f);
      }));

    const opt = {
      simulateDeployment: true,
      forceDeployment: true,
      s3options: {
        params: {
          Bucket: 'lucify-test-bucket',
        },
      },
    };
    const streams = [aStream, eStream];
    s3.publishInSeries(streams, opt)
      .pipe(es.writeArray((err, files) => {
        expect(err).not.to.exist;
        // inspect(files.map(f => f.s3));
        expect(files).to.have.length(13);
        expect(files).to.have.length(entries.length + assets.length);
        for (let i = assets.length - 1; i >= 0; i--) { // first assets
          expect(assets[i].path).to.equal(files[i].path);
        }
        for (let j = entries.length - 1; j >= 0; j--) { // then entrypoints
          expect(entries[j].path).to.equal(files[j + assets.length].path);
        }
        done();
      }));
  });
});

if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  describe('actual upload', () => {
    it('files get uploaded and have the correct ContentType property for compression', done => {
      const bucket = 'lucify-test-bucket';
      const entry = s3.entryPointStream('test/dist', entryPoints, undefined, true);
      const asset = s3.assetStream('test/dist', entryPoints, undefined, undefined, undefined, true);

      cleanBucket(bucket, err => {
        if (err) return done(err);
        return uploadAndReturnPaths(bucket, [asset, entry], (_err, files) => {
          if (_err) return done(_err);
          return assertS3(files, bucket, (__err, _files) => {
            if (__err) return done(__err);
            const nonUploaded = _.differenceWith(files, _files, (a, b) => a.s3.path === b.Key);
            const nonZippedS3 = _.filter(_files, f => f.ContentEncoding !== 'gzip')
              .map(f => _.pick(f, 'Key', 'ContentType'));
            const nonZippedLocal = _.filter(files, f => f.s3.headers['Content-Encoding'] !== 'gzip')
              .map(f => f.s3.path);
            expect(nonUploaded, 'Some files were not uploaded').lengthOf(0);
            expect(nonZippedLocal, 'Some local files have incorrect headers').lengthOf(0);
            expect(nonZippedS3, 'Some files were not gzipped').lengthOf(0);
            return done();
          });
        });
      });
    });
  });
}
