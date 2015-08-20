var http = require('http');

// Extend function written for Object
Object.prototype.extend = function () {
    var hasOwnProperty = Object.hasOwnProperty;
    var object = Object.create(this);
    var length = arguments.length;
    var index = length;
    
    while (index) {
        var extension = arguments[length - (index--)];

        for (var property in extension) {
            if (hasOwnProperty.call(extension, property) || typeof object[property] === "undefined") {
                object[property] = extension[property];
            }
        }
    }
        
    return object;
};

// Event emitter function
function eventEmitter() {
    var maxListeners = 10;
    var events = events || {};

    this.on = function (event, listener) {
        if (typeof events[event] !== "undefined") {
            events[event].push(listener);
        } else {
            events[event] = [listener];
        }

        return this;
    };

    this.once = function (event, listener) {
        (function (self, evs, ev, listen) {
            function g() {
                if (typeof evs[ev] !== "undefined") {
                    if (evs[ev].length > 0) {
                        evs[ev].length = 0;
                        delete evs[ev];
                    }

                    listen.apply(self, arguments);
                }
            }

            self.on(ev, g);
        })(this, events, event, listener);

        return this;
    };

    this.trigger = function (event) {
        (function (self, evs, ev, args) {
            var list = evs[ev];

            if (typeof list !== "undefined") {
                var length = list.length;
                var index = length;
                var newArgs = Array.prototype.slice.call(args, 1);

                while (index) {
                    var listener = list[length - (index--)];

                    if (typeof listener !== "undefined") {
                        listener.apply(self, newArgs);
                    }
                }
            }
        })(this, events, event, arguments);

        return this;
    };
}

// Individual stock data
var stockData = {
    date: null,
    open: 0,
    close: 0,
    high: 0,
    low: 0,
    volume: 0,
    adjClose: 0,
    fifty: 0,
    twoHundred: 0
};

// Create stock data collector object
var stockDataCollector = {
    create: function () {
        var self = this;
        eventEmitter.call(self);
        return self;
    },
    createYahooStockUrl: function (symbol, dateFrom, dateTo) {
        if (!dateFrom && !(dateFrom instanceof Date) && !dateTo && !(dateTo instanceof Date) && !symbol && symbol !== "") {
            return "";
        }

        var url = "http://real-chart.finance.yahoo.com/table.csv?s=";
        url += symbol;
        url += "&d=" + dateTo.getUTCMonth() + "&e=" + dateTo.getUTCDay() + "&f=" + dateTo.getUTCFullYear();
        url += "&a=" + dateFrom.getUTCMonth() + "&b=" + dateFrom.getUTCDay() + "&c=" + dateFrom.getUTCFullYear() + "&ignore=.csv";

        return url;
    },
    parseStockData: function (data) {
        var splitData = data.split('\n');

        if (typeof splitData === "undefined" || !splitData || !splitData.length || splitData.length < 2) {
            return null;
        }

        var header = splitData[0];
        var values = splitData.slice(1);
        var stockData = [];

        values.forEach(function (element, index, array) {
            if (element && element.trim() !== "") {
                var splitData = element.split(',');
                var stock = Object.create(stockData);

                stock.date = Date.parse(splitData[0]);
                stock.open = Math.round(splitData[1] * 100) / 100;
                stock.high = Math.round(splitData[2] * 100) / 100;
                stock.low = Math.round(splitData[3] * 100) / 100;
                stock.close = Math.round(splitData[4] * 100) / 100;
                stock.volume = splitData[5] >>> 0;
                stock.adjClose = Math.round(splitData[6] * 100) / 100;

                stockData.push(stock);
            }
        });

        // Sort data in ascending order of date
        stockData.sort(function (a, b) {
            if (a.date > b.date) {
                return 1;
            }

            if (a.date < b.date) {
                return -1;
            }

            // a must be equal to b
            return 0;
        });

        var fifty = 0;
        var twoHundred = 0;

        // Calculate fifty and two hundred moving day averages
        stockData.forEach(function (element, index, array) {
            if (index > 1) {
                var fiftyArray = array.slice(Math.max(index - 50, 0), index);

                fifty = fiftyArray.map(function (d) { return d.adjClose }).reduce(function (previousValue, currentValue, index, array) {
                    return previousValue + currentValue;
                }) / fiftyArray.length;

                var thArray = array.slice(Math.max(index - 200, 0), index);

                twoHundred = thArray.map(function (d) { return d.adjClose }).reduce(function (previousValue, currentValue, index, array) {
                    return previousValue + currentValue;
                }) / thArray.length;
            } else {
                fifty = element.adjClose;
                twoHundred = element.adjClose;
            }

            element.fifty = fifty;
            element.twoHundred = twoHundred;
        });

        // Minmize data to return
        stockData = stockData.map(function (element) {
            return {date: element.date, adjClose: element.adjClose, fifty: element.fifty, twoHundred: element.twoHundred};
        });

        return {"headers": header.split(','), "data": stockData};
    },
    getData: function (symbol, fromDate, toDate) {
        var stockUrl = this.createYahooStockUrl(symbol, fromDate, toDate);
        var self = this;

        if (stockUrl === "") {
            self.trigger('error', '[stockDataCollector.getData] Invalid stock URL.');
        } else {
            http.get(stockUrl, function (res) {
                var rawStockData = "";
                responseCode = res.statusCode >>> 0;

                // Ensure valid response code on request
                if (responseCode != 200) {
                    self.trigger('error', "[stockDataCollector.getData] Got invalid response code: " + responseCode);
                    return;
                }

                // Ensure return type is text-csv
                if (JSON.stringify(res.headers["content-type"]) !== "\"text/csv\"") {
                    self.trigger('error', "[stockDataCollector.getData] Got invalid response type: " + JSON.stringify(res.headers["content-type"]));
                    return;
                }

                res.on("data", function (chunk) {
                    rawStockData += chunk;
                });

                res.on("end", function () {
                    self.trigger('success', rawStockData);
                });
            }).on('error', function (e) {
                self.trigger('error', "[stockDataCollector.getData] Got error: " + e.message);
            });
        }
    }
};

var stockObject = stockDataCollector.create();

var express = require('express');
var bodyParser = require('body-parser');
var app = express();

app.use(bodyParser.json());
app.use('/bower_components', express.static(__dirname + '/bower_components'));

app.get('/', function (req, res) {
    res.sendfile('default.html');
});

app.post('/stock', function (req, res) {
    stockObject.once('success', function (data) {
        var stockData = this.parseStockData(data);

        if (stockData.data && stockData.headers) {
            try {
                res.send(stockData);
            } catch (exp) {
                console.log("[app.post] Exception: " + exp.message);
            }
        } else {
            console.log("[app.post] Data could not be parsed correctly.");
        }
    });

    stockObject.once('error', function (message) {
        try {
            res.sendStatus(403);
        } catch (exp) {
            console.log("[app.post] Error exception: " + exp.message);
        }
    });

    var data = stockObject.getData(req.body.symbol, new Date(2008, 1, 1), new Date());
}); 

var server = app.listen(3000, function () {
    var host = server.address().address;
    var port = server.address().port;

    console.log("[server] Example app listening at http://%s:%s", host, port);
});