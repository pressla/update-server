// Load modules

var EventEmitter = require('events').EventEmitter;
var Fs = require('fs');
var Os = require('os');
var Path = require('path');

var Code = require('code');
var Lab = require('lab');
var lab = exports.lab = Lab.script();
var Hoek = require('hoek');
var GoodFile = require('..');


// Declare internals

var internals = {
    tempDir: Os.tmpDir()
};

internals.removeLog = function (path) {

    if (Fs.existsSync(path)) {
        Fs.unlinkSync(path);
    }
};


internals.getLog = function (path, callback) {

    Fs.readFile(path, { encoding: 'utf8' }, function (error, data) {

        if (error) {
            return callback(error);
        }

        var results = JSON.parse('[' + data.replace(/\n/g,',').slice(0,-1) + ']');
        callback(null, results);
    });
};

// Lab shortcuts

var describe = lab.describe;
var it = lab.it;
var expect = Code.expect;

describe('GoodFile', function () {

    it('throws an error without using new', function (done) {

        expect(function () {

            var reporter = GoodFile();
        }).to.throw('GoodFile must be created with new');

        done();
    });

    it('validates the options argument', function (done) {

        expect(function () {

            var reporter = new GoodFile();
        }).to.throw(Error, /value must be a (string|number)/);

        done();
    });

    it('stop() ends the stream', function (done) {

        var file = Hoek.uniqueFilename(internals.tempDir);
        var reporter = new GoodFile(file, { request:  '*' });
        var ee = new EventEmitter();

        reporter.start(ee, function (error) {

            expect(error).to.not.exist();

            ee.emit('report', 'request', { id: 1, timestamp: Date.now() });

            reporter.stop();

            // This should NOT get reported because the stream has been stopped
            ee.emit('report', 'request', { id: 2, timestamp: Date.now() });

            reporter._writeStream.on('finish', function() {

                expect(reporter._writeStream.bytesWritten).to.equal(35);
                expect(reporter._writeStream.path).to.equal(file);
                expect(reporter._writeStream._writableState.ended).to.be.true();
                expect(reporter._state.stopped).to.be.true();

                internals.removeLog(reporter._writeStream.path);

                done();
            });
        });
    });

    it('logs a stream error if it occurs', function (done) {

        var file = Hoek.uniqueFilename(internals.tempDir);
        var reporter = new GoodFile(file, { request:  '*' });
        var ee = new EventEmitter();
        var logError = console.error;

        console.error = function (value) {

            console.error = logError;
            expect(value.message).to.equal('mock error');
            expect(reporter._state.stopped).to.be.true();
            internals.removeLog(reporter._writeStream.path);
            done();
        };

        reporter.start(ee, function (error) {

            expect(error).to.not.exist();
            reporter._writeStream.emit('error', new Error('mock error'));
        });
    });

    it('properly sanitizes `format`, `prefix` and `extension`', function (done) {

        var sep = Path.sep;
        var reporter = new GoodFile({
            path: internals.tempDir,
            format: 'Y' + sep + 'M' + sep,
            extension: 'foo' + sep + 'bar'
        });

        expect(reporter._settings.format).to.equal('Y-M-');
        expect(reporter._settings.extension).to.equal('.foo-bar');

        done();
    });

    describe('start()', function () {

        it('properly sets up the path and file information if the file name is specified', function (done) {

            var file = Hoek.uniqueFilename(internals.tempDir);
            var reporter = new GoodFile(file);
            var ee = new EventEmitter();

            reporter.start(ee, function (error) {

                expect(error).to.not.exist();

                expect(reporter._writeStream.path).to.equal(file);

                internals.removeLog(reporter._writeStream.path);
                done();
            });
        });

        it('properly creates a random file if the directory option is specified', function (done) {

            var reporter = new GoodFile({ path: internals.tempDir });
            var ee = new EventEmitter();

            reporter.start(ee, function (error) {

                expect(error).to.not.exist();
                expect(/good-file-\d+-.+.log/g.test(reporter._writeStream.path)).to.be.true();

                internals.removeLog(reporter._writeStream.path);
                done();
            });
        });

        it('uses the options passed via directory', function (done) {

            var reporter = new GoodFile({
                path: internals.tempDir,
                extension: 'fun',
                prefix: 'ops-log',
                format: 'YY$DDDD'
            });
            var ee = new EventEmitter();

            reporter.start(ee, function (error) {

                expect(error).to.not.exist();
                expect(/\/ops-log-\d{2}\$\d{3}-.+.fun/g.test(reporter._writeStream.path)).to.be.true();

                internals.removeLog(reporter._writeStream.path);
                done();
            });
        });
    });

    describe('_report()', function () {

        it('writes to the current file and does not create a new one', function (done) {

            var file = Hoek.uniqueFilename(internals.tempDir);
            var reporter = new GoodFile(file, { request:  '*' });
            var ee = new EventEmitter();

            reporter.start(ee, function (error) {

                expect(error).to.not.exist();
                expect(reporter._writeStream.path).to.equal(file);

                for (var i = 0; i < 20; ++i) {

                    ee.emit('report', 'request', { statusCode:200, id: i, tag: 'my test ' + i });
                }

                reporter._writeStream.on('finish', function() {

                    expect(error).to.not.exist();

                    expect(reporter._writeStream.bytesWritten).to.equal(900);
                    internals.removeLog(reporter._writeStream.path);

                    done();
                });

                reporter.stop();
            });
        });

        it('handles circular references in objects', function (done) {

            var file = Hoek.uniqueFilename(internals.tempDir);
            var reporter = new GoodFile(file, { request: '*' });
            var ee = new EventEmitter();

            reporter.start(ee, function (error) {

                expect(error).to.not.exist();

                var data = {
                    id: 1,
                    timestamp: Date.now()
                };

                data._data = data;

                ee.emit('report', 'request', data);

                reporter._writeStream.on('finish', function() {

                    internals.getLog(reporter._writeStream.path, function (error, results) {

                        expect(error).to.not.exist();
                        expect(results.length).to.equal(1);
                        expect(results[0]._data).to.equal('[Circular ~]');

                        internals.removeLog(reporter._writeStream.path);

                        done();
                    });
                });

                reporter.stop();
            });
        });

        it('can handle a large number of events', function (done) {

            var file = Hoek.uniqueFilename(internals.tempDir);
            var reporter = new GoodFile(file, { request: '*' });
            var ee = new EventEmitter();

            reporter.start(ee, function (error) {

                expect(error).to.not.exist();
                expect(reporter._writeStream.path).to.equal(file);

                for (var i = 0; i <= 10000; i++) {
                    ee.emit('report', 'request', { id: i, timestamp: Date.now(), value: 'value for iteration ' + i });
                }

                reporter._writeStream.on('finish', function() {

                    expect(reporter._writeStream.bytesWritten).to.equal(727855);
                    internals.removeLog(reporter._writeStream.path);

                    done();
                });

                reporter.stop();
            });
        });

        it('will log events even after a delay', function (done) {

            var file = Hoek.uniqueFilename(internals.tempDir);
            var reporter = new GoodFile(file, { request: '*' });
            var ee = new EventEmitter();

            reporter.start(ee, function (error) {

                expect(error).to.not.exist();
                expect(reporter._writeStream.path).to.equal(file);

                for (var i = 0; i <= 100; i++) {
                    ee.emit('report', 'request', { id: i, timestamp: Date.now(), value: 'value for iteration ' + i });
                }

                setTimeout(function() {

                    for (var i = 0; i <= 100; i++) {
                        ee.emit('report', 'request', { id: i, timestamp: Date.now(), value: 'inner iteration ' + i });
                    }

                    reporter._writeStream.on('finish', function() {

                        expect(reporter._writeStream.bytesWritten).to.equal(13498);
                        internals.removeLog(reporter._writeStream.path);
                        done();
                    });

                    reporter.stop();
                }, 500);
            });
        });

        it('rotates logs on the specified internal', function (done) {

            var reporter = new GoodFile({
                path: internals.tempDir,
                rotate: 'daily',
                format: 'YY#DDDD#MM',
                extension: ''
            }, { request:  '*' });
            var ee = new EventEmitter();
            var min = Math.min;

            var files = [];

            var pathOne = Path.join(internals.tempDir, 'rotate1');
            var pathTwo = Path.join(internals.tempDir, 'rotate2');

            Math.min = function () {

                Math.min = min;
                return 100;
            };

            var getFile = reporter.getFile;

            reporter.getFile = function () {

                var result = getFile.call(this);

                files.push(result);

                return result;
            };

            reporter.start(ee, function (error) {

                expect(error).to.not.exist();

                for (var i = 0; i < 10; ++i) {

                    ee.emit('report', 'request', { statusCode:200, id: i, tag: 'my test 1 - ' + i });
                }

                setTimeout(function () {

                    reporter._writeStream.on('finish', function () {

                        internals.getLog(files[0], function (err, fileOne) {

                            expect(err).to.not.exist();

                            internals.getLog(files[1], function (err, fileTwo) {

                                expect(err).to.not.exist();

                                var one = fileOne[0];
                                var two = fileTwo[0];

                                expect(fileOne).to.have.length(10);
                                expect(fileTwo).to.have.length(10);

                                expect(one).to.deep.equal({
                                    statusCode: 200,
                                    id: 0,
                                    tag: 'my test 1 - 0'
                                });
                                expect(two).to.deep.equal({
                                    statusCode: 200,
                                    id: 0,
                                    tag: 'my test 2 - 0'
                                });

                                for (var i = 0, il = files.length; i < il; ++i) {
                                    expect(/good-file-\d+#\d+#\d+-[\w,\d]+$/g.test(files[i])).to.be.true();
                                    internals.removeLog(files[i]);
                                }

                                done();
                            });
                        });
                    });

                    for (var i = 0; i < 10; ++i) {
                        ee.emit('report', 'request', { statusCode: 200, id: i, tag: 'my test 2 - ' + i });
                    }

                    reporter.stop();
                }, 150);
            });
        });
    });
});
