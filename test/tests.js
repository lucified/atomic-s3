const expect = require('chai').expect;
const es = require('event-stream');
const s3 = require('../src/main');
const fs = require('fs');
const debug = require('gulp-debug');
const through2 = require('through2').obj;
const AWS = require('aws-sdk');
const _ = require('lodash');


AWS.config.update({region: process.env.AWS_REGION || 'eu-west-1'});


var inspect = (obj) => console.log(require('util').inspect(obj,{ depth: null })); // eslint-disable-line

const entryPoints = [
  '**/*.html',
  '**/resize.js',
  '**/embed.js',
  '*.{png,ico}'
];


describe('entrypoint-stream', () => {
  it('contains the entrypoints', done => {
    s3.entryPointStream('test/dist', entryPoints)
      .pipe(debug())
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
      .pipe(debug())
      .pipe(es.writeArray((err, files) => {
        expect(err).not.to.exist;
        expect(files).to.have.length(4);
        done();
      }));
  });
});


describe('publish-stream', () => {

  it('contains everything in correct order', done => {

    var entries = [];
    var eStream = s3.entryPointStream('test/dist', entryPoints)
      .pipe(through2((f,_e,cb) => {
        entries.push(f);
        cb(null, f);
      }));
    var assets = [];
    var aStream = s3.assetStream('test/dist', entryPoints)
      .pipe(through2((f,_e,cb) => {
        assets.push(f);
        cb(null, f);
      }));

    const opt = {
      simulateDeployment: true,
      forceDeployment: true,
      s3options: {
        params: {
          Bucket: 'lucify-test-bucket'
        }
      },
    };
    const streams = [aStream, eStream];
    s3.publishInSeries(streams, opt)
      .pipe(es.writeArray((err, files) => {
        expect(err).not.to.exist;
        inspect(files.map(f => f.s3));
        expect(files).to.have.length(11);
        expect(files).to.have.length(entries.length+assets.length);
        for (var i = assets.length - 1; i >= 0; i--) { // first assets
          expect(assets[i].path).to.equal(files[i].path);
        }
        for (var j = entries.length - 1; j >= 0; j--) { // then entrypoints
          expect(entries[j].path).to.equal(files[j+assets.length].path);
        }
        done();
      }));
  });
});


// describe('cache', () => {
//   it('gets written correctly', done => {
//     var bucket = 'lucify-test-bucket';
//     var cacheFile = `.awspublish-${bucket}`;
//     try {
//       fs.unlinkSync(cacheFile, 'utf8');
//     } catch(err) {
//     }

//     function uploadAndTest(state, done) {

//       var entry = s3.entryPointStream('test/dist');
//       var asset = s3.assetStream('test/dist');

//       var combinedStream = s3.publishInSeries([asset, entry], {bucket});

//       var files = [];
//       return combinedStream
//         .pipe(through2((f, _enc, cb) => {
//           expect(f.s3).to.exist;
//           expect(f.s3.state).to.equal(state);
//           files.push(f);
//           cb(null, f);
//         }, () => {
//           try {
//             var cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
//             expect(_.keys(cache)).to.have.length(files.length);
//             done();
//           } catch(err) {
//             done(err);
//           }
//         }));
//     }
//     cleanBucket(bucket, err => {
//       if(err) return done(err);
//       uploadAndTest('create', err => {
//         if(err) return done(err);
//         uploadAndTest('cache', done);
//       });
//     });
//   });
// });


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
