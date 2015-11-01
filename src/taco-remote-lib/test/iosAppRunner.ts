﻿/**
﻿ * ******************************************************
﻿ *                                                       *
﻿ *   Copyright (C) Microsoft. All rights reserved.       *
﻿ *                                                       *
﻿ *******************************************************
﻿ */
/// <reference path="../../typings/mocha.d.ts" />
/// <reference path="../../typings/node.d.ts" />
/// <reference path="../../typings/should.d.ts" />
/// <reference path="../../typings/Q.d.ts" />
"use strict";

/* tslint:disable:no-var-requires */
// var require needed for should module to work correctly
// Note not import: We don't want to refer to shouldModule, but we need the require to occur since it modifies the prototype of Object.
var shouldModule: any = require("should");
/* tslint:enable:no-var-requires */

import net = require ("net");
import Q = require ("q");

import runner = require ("../ios/iosAppRunnerHelper");
import utils = require ("taco-utils");

import Logger = utils.Logger;

interface IMockDebuggerProxy extends net.Server {
    protocolState?: number;
};

// Tests for lib/darwin/darwinAppRunner.js functionality
describe("Device functionality", function (): void {
    // Check that when the debugger behaves nicely, we do as well
    it("should complete the startup sequence when the debugger is well behaved", function (done: MochaDone): void {
        var port: number = 12345;
        var appPath: string = "/private/var/mobile/Applications/042F57CA-9717-4655-8349-532093FFCF44/BlankCordovaApp1.app";

        var encodedAppPath: string = "2F707269766174652F7661722F6D6F62696C652F4170706C69636174696F6E732F30343246353743412D393731372D343635352D383334392D3533323039334646434634342F426C616E6B436F72646F7661417070312E617070";
        encodedAppPath.should.equal(runner.encodePath(appPath));

        var mockDebuggerProxy: IMockDebuggerProxy = net.createServer(function (client: net.Socket): void {
            mockDebuggerProxy.close();
            client.on("data", function (data: Buffer): void {
                var dataString: string = data.toString();
                if (mockDebuggerProxy.protocolState % 2 === 1) {
                    // Every second message should be an acknowledgement of a send of ours
                    dataString[0].should.equal("+");
                    mockDebuggerProxy.protocolState++;
                    dataString = dataString.substring(1);
                    if (dataString === "") {
                        return;
                    }
                }

                dataString[0].should.equal("$");
                var expectedResponse: string = "";
                switch (mockDebuggerProxy.protocolState) {
                    case 0:
                        expectedResponse = "A" + encodedAppPath.length + ",0," + encodedAppPath;
                        var checksum: number = 0;
                        for (var i: number = 0; i < expectedResponse.length; ++i) {
                            checksum += expectedResponse.charCodeAt(i);
                        };
                        /* tslint:disable:no-bitwise */
                        // Some bitwise operations needed to calculate the checksum here
                        checksum = checksum & 0xFF;
                        /* tslint:enable:no-bitwise */
                        var checkstring: string = checksum.toString(16).toUpperCase();
                        if (checkstring.length === 1) {
                            checkstring = "0" + checkstring;
                        }

                        expectedResponse = "$" + expectedResponse + "#" + checkstring;
                        dataString.should.equal(expectedResponse);
                        mockDebuggerProxy.protocolState++;
                        client.write("+");
                        client.write("$OK#9A");
                        break;
                    case 2:
                        expectedResponse = "$Hc0#DB";
                        dataString.should.equal(expectedResponse);
                        mockDebuggerProxy.protocolState++;
                        client.write("+");
                        client.write("$OK#9A");
                        break;
                    case 4:
                        expectedResponse = "$c#63";
                        dataString.should.equal(expectedResponse);
                        mockDebuggerProxy.protocolState++;
                        client.write("+");
                        // Respond with empty output
                        client.write("$O#4F");
                        client.end();
                }
            });
        });
        mockDebuggerProxy.protocolState = 0;
        mockDebuggerProxy.on("error", done);

        mockDebuggerProxy.listen(port, function (): void {
            Logger.log("MockDebuggerProxy listening");
        });

        Q.timeout(runner.startAppViaDebugger(port, appPath, 5000), 1000)
            .done(function (): void {
            done();
        }, done);
    });

    // Check that when the debugger reports an error, we notice it
    it("should report an error if the debugger fails for some reason", function (done: MochaDone): void {
        var port: number = 12345;
        var appPath: string = "/private/var/mobile/Applications/042F57CA-9717-4655-8349-532093FFCF44/BlankCordovaApp1.app";

        var encodedAppPath: string = "2F707269766174652F7661722F6D6F62696C652F4170706C69636174696F6E732F30343246353743412D393731372D343635352D383334392D3533323039334646434634342F426C616E6B436F72646F7661417070312E617070";
        encodedAppPath.should.equal(runner.encodePath(appPath));

        var mockDebuggerProxy: IMockDebuggerProxy = net.createServer(function (client: net.Socket): void {
            mockDebuggerProxy.close();
            client.on("data", function (data: Buffer): void {
                var dataString: string = data.toString();
                if (mockDebuggerProxy.protocolState % 2 === 1) {
                    // Every second message should be an acknowledgement of a send of ours
                    dataString[0].should.equal("+");
                    mockDebuggerProxy.protocolState++;
                    dataString = dataString.substring(1);
                    if (dataString === "") {
                        return;
                    }
                }

                dataString[0].should.equal("$");

                var expectedResponse: string = "";
                switch (mockDebuggerProxy.protocolState) {
                    case 0:
                        expectedResponse = "A" + encodedAppPath.length + ",0," + encodedAppPath;
                        var checksum: number = 0;
                        for (var i: number = 0; i < expectedResponse.length; ++i) {
                            checksum += expectedResponse.charCodeAt(i);
                        };
                        /* tslint:disable:no-bitwise */
                        // Some bit operations needed to calculate checksum
                        checksum = checksum & 0xFF;
                        /* tslint:enable:no-bitwise */
                        var checkstring: string = checksum.toString(16).toUpperCase();
                        if (checkstring.length === 1) {
                            checkstring = "0" + checkstring;
                        }

                        expectedResponse = "$" + expectedResponse + "#" + checkstring;
                        dataString.should.equal(expectedResponse);
                        mockDebuggerProxy.protocolState++;
                        client.write("+");
                        client.write("$OK#9A");
                        break;
                    case 2:
                        expectedResponse = "$Hc0#DB";
                        dataString.should.equal(expectedResponse);
                        mockDebuggerProxy.protocolState++;
                        client.write("+");
                        client.write("$OK#9A");
                        break;
                    case 4:
                        expectedResponse = "$c#63";
                        dataString.should.equal(expectedResponse);
                        mockDebuggerProxy.protocolState++;
                        client.write("+");
                        client.write("$E23#AA"); // Report an error
                        client.end();
                }
            });
        });
        mockDebuggerProxy.protocolState = 0;
        mockDebuggerProxy.on("error", done);

        mockDebuggerProxy.listen(port, function (): void {
            Logger.log("MockDebuggerProxy listening");
        });

        Q.timeout(runner.startAppViaDebugger(port, appPath, 5000), 1000).done(function (): void {
            done(new Error("Starting the app should have failed!"));
        }, function (err: any): void {
                err.should.equal("UnableToLaunchApp");
                done();
            });
    });
});
