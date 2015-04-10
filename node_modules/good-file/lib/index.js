// Load modules

var Crypto = require('crypto');
var Fs = require('fs');
var Path = require('path');
var Stream = require('stream');

var GoodReporter = require('good-reporter');
var Hoek = require('hoek');
var Joi = require('joi');
var Moment = require('moment');
var Stringify = require('json-stringify-safe');

var Schema = require('./schema');

// Declare internals

var internals = {
    defaults: {
        directory: {
            format: 'YYYY-MM-DD',
            extension: '.log',
            prefix: 'good-file'
        }
    },
    timeMap: {
        hourly: 'hour',
        daily: 'day',
        weekly: 'week',
        yearly: 'year'
    },
    sanitize: new RegExp(Hoek.escapeRegex(Path.sep), 'g'),
    MAX_TIME: 2147483647 // 2^31-1
};

internals.setUpRotate = function (reporter, period) {

    var now = Moment.utc();

    period = period.toLowerCase();

    // match [1] user string
    now.endOf(internals.timeMap[period]);

    var timeout = now.valueOf() - Date.now();
    timeout = Math.min(timeout, internals.MAX_TIME);

    reporter._state.timeout = setTimeout(function () {

        internals.rotate(reporter, period);
    }, timeout);
};


internals.rotate = function (reporter, period) {

    reporter._readableStream.unpipe(reporter._writeStream);
    reporter._writeStream = reporter._buildWriteStream();
    reporter._readableStream.pipe(reporter._writeStream);
    internals.setUpRotate(reporter, period);
};


module.exports = internals.GoodFile = function (config, events) {

    var settings;

    config = config || false;

    Hoek.assert(this.constructor === internals.GoodFile, 'GoodFile must be created with new');

    Joi.assert(config, Schema.options);

    if (typeof config === 'string') {
        settings = {
            file: config
        };
    }
    else {
        settings = Hoek.applyToDefaults(internals.defaults.directory, config);
    }

    if (settings.file) {

        this.getFile = function () {

            return settings.file;
        };
    }
    else {

        settings.extension = !settings.extension || settings.extension[0] === '.' ? settings.extension : '.' + settings.extension;


        // Replace any path separators with a "-"
        settings.format = settings.format.replace(internals.sanitize, '-');
        settings.prefix = settings.prefix.replace(internals.sanitize, '-');
        settings.extension = settings.extension.replace(internals.sanitize, '-');

        this.getFile = function () {

            var dateString = Moment.utc().format(settings.format);
            var name = [settings.prefix, dateString, Crypto.randomBytes(5).toString('hex')].join('-');

            name = settings.extension ? name + settings.extension : name;

            return Path.join(settings.path, name);
        };
    }

    GoodReporter.call(this, events, settings);

    this._state = {
        stopped: null,
        timeout: null
    };
};


Hoek.inherits(internals.GoodFile, GoodReporter);


internals.GoodFile.prototype.start = function (emitter, callback) {

    var onReport = this._handleEvent.bind(this);
    var self = this;

    emitter.on('report', onReport);

    this._onStreamError = function (err) {

        // Remove the listener for the report event
        emitter.removeListener('report', onReport);
        self._state.stopped = true;
        console.error(err);
    };

    this._readableStream = new Stream.Readable();
    this._readableStream._read = Hoek.ignore;
    this._state.stopped = false;

    if (this._settings.rotate) {
        internals.setUpRotate(this, this._settings.rotate);
    }

    this._writeStream = this._buildWriteStream();
    this._readableStream.pipe(this._writeStream);

    callback();
};


internals.GoodFile.prototype.stop = function () {

    // Prevent in-flight events from being written
    this._state.stopped = true;
    this._readableStream.push(null);
    clearTimeout(this._state.timeout);
};


internals.GoodFile.prototype._report = function (event, eventData) {

    if (this._state.stopped) { return; }

    var eventString = Stringify(eventData) + '\n';
    this._readableStream.push(eventString);
};


internals.GoodFile.prototype._buildWriteStream = function () {

    var result = Fs.createWriteStream(this.getFile(), { flags: 'a', end: false, encoding: 'utf8' });

    result.once('error', this._onStreamError);

    return result;
};
