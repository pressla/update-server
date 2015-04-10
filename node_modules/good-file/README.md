# good-file

File logging module for [good](https://github.com/hapijs/good) process monitoring.

![Build Status](https://travis-ci.org/hapijs/good-file.svg?branch=master) ![Current Version](https://img.shields.io/npm/v/good-file.svg)

Lead Maintainer: [Adam Bretz](https://github.com/arb)

## Usage

`good-file` is a [good-reporter](https://github.com/hapijs/good-reporter) implementation to write hapi server events to log files.

## Good File
### new GoodFile (config, events)

creates a new GoodFile object with the following arguments
- `config` - specifications for the file that will be used. All file operations are done in "append" mode.
	- `String` - a string that indicates the log file to use. Opened in "append" mode.
	- `Object` - a configuration object for automatically generated files. Auto generated files use the following pattern for file naming: "{`options.prefix`}-{utcTime.format(`options.format`)}-{random string}.{`settings.extension`}"
	 	- `path` - required. Path to the directory to store log files.
	 	- `[format]` - a [MomentJs](http://momentjs.com/docs/#/displaying/format/) format string. Defaults to "YYYY-MM-DD".
	 	- `[extension]` - file extension to use when creating a file. Defaults to ".log". Set to "" for no extension.
	 	- `[prefix]` - file name prefix to use when creating a file. Defaults to "good-file"
	 	- `[rotate]` - a string indicating a log rotation time span. The designated time span will start a timer that will trigger at the *end* of the specified time span. For example, using "daily", a new log file would be created at *approximately* 11:59:59.999 on the current day. Please see [this section](http://momentjs.com/docs/#/manipulating/end-of/) in the Moment.js documentation for more details. The string must be one of the following values: ['hourly', 'daily', 'weekly', 'monthly'].
		> **Limitations** A new file is *always* created when the process starts, regardless of `rotate` option; this is to prevent collisions. So if you start and stop the process several times in a row, there will be a new file created each time and a new timer will start at the beginning of the process. There is also a maximum "wait time" good-file can allow. If your time string exceeds this number, it will be replaced with `2^31 - 1` milliseconds (about 25 days). This is a limitation in how JavaScript/[Node implements](https://github.com/joyent/node/blob/master/lib/timers.js#L29) timers. There are also several time related precision issues when working with JavaScript. The log rotation will happen "close enough" to the desired `rotate` option.
- `events` - an object of key value pairs.
	- `key` - one of the supported [good events](https://github.com/hapijs/good) indicating the hapi event to subscribe to
	- `value` - a single string or an array of strings to filter incoming events. "\*" indicates no filtering. `null` and `undefined` are assumed to be "\*"


### GoodFile Methods
`good-file` implements the [good-reporter](https://github.com/hapijs/good-reporter) interface as has no additional public methods.
