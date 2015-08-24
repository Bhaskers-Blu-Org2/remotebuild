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
"use strict";
var should_module = require("should"); // Note not import: We don't want to refer to should_module, but we need the require to occur since it modifies the prototype of Object.

import fs = require ("fs");
import http = require ("http");
import https = require ("https");
import os = require ("os");
import path = require ("path");
import Q = require ("q");
import request = require ("request");
import rimraf = require ("rimraf");

import ConnectionSecurityHelper = require ("../cli/remoteBuild/connectionSecurityHelper");
import resources = require ("../resources/resourceManager");
import ServerMock = require ("./utils/serverMock");
import Settings = require ("../cli/utils/settings");
import RemoteMod = require ("../cli/remote");
import RemoteMock = require ("./utils/remoteMock");
import TacoUtility = require ("taco-utils");
import ms = require ("./utils/memoryStream");

import utils = TacoUtility.UtilHelper;

var remote = new RemoteMod();

describe("taco remote", function (): void {
    var testHome = path.join(os.tmpdir(), "taco-cli", "setup");
    var tacoSettingsFile = path.join(testHome, "TacoSettings.json");
    before(function (): void {
        utils.createDirectoryIfNecessary(testHome);
        process.env["TACO_HOME"] = testHome;
        process.env["TACO_UNIT_TEST"] = true;
        if (fs.existsSync(tacoSettingsFile)) {
            fs.unlinkSync(tacoSettingsFile);
        }
    });

    after(function (done: MochaDone): void {
        if (fs.existsSync(tacoSettingsFile)) {
            fs.unlinkSync(tacoSettingsFile);
        }

        rimraf(testHome, function (err: Error): void { done(); }); // ignore errors
    });

    function makeICommandData(args: string[]): TacoUtility.Commands.ICommandData {
        return {
            options: {},
            original: args,
            remain: args
        };
    }

    it("should handle arguments", function (): void {
        remote.canHandleArgs(makeICommandData(["remote", "ios"])).should.be.true;
        // Even bad arguments should return true because we don't want to pass through to cordova
        remote.canHandleArgs(makeICommandData(["foo"])).should.be.true;
        remote.canHandleArgs(makeICommandData([])).should.be.true;
    });

    var remoteRun = function (args: string[]): Q.Promise<any> {
        return remote.run(makeICommandData(args));
    };

    it("should save in the expected format", function (mocha: MochaDone): void {
        var questionsAsked = 0;
        var sessionClosed = false;
        var desiredState = {
            host: "localhost",
            port: 3000,
            pin: "",
            mountPoint: "testMountPoint"
        };
        var expectedSequence = [
            {
                expectedUrl: "/modules/taco-remote",
                head: {
                    "Content-Type": "text/plain"
                },
                statusCode: 200,
                response: desiredState.mountPoint
            }
        ];
        var mockServer = http.createServer();
        var serverFunction = ServerMock.generateServerFunction(mocha, expectedSequence);

        var cliVersion = require("../package.json").version;
        var expectedTelemetryProperties: TacoUtility.ICommandTelemetryProperties = {
                        subCommand: { isPii: false, value: "add" },
                        platform: { isPii: false, value: "ios" },
                        isSecure: { isPii: false, value: "false" }
        };

        mockServer.listen(desiredState.port);
        mockServer.on("request", serverFunction);

        RemoteMod.CliSession = RemoteMock.makeCliMock(mocha, () => { sessionClosed = true; }, desiredState, () => { questionsAsked++; });
        Q(["add", "ios"]).then(remoteRun).then(function (telemetryParameters: TacoUtility.ICommandTelemetryProperties): void {
            // Verify telemetry properties               
            telemetryParameters.should.be.eql(expectedTelemetryProperties);
            if (questionsAsked !== 3) {
                throw new Error("Wrong number of questions asked: " + questionsAsked);
            } else if (!sessionClosed) {
                throw new Error("CLI Session not closed");
            }
        }).then(function (): Q.Promise<Settings.ISettings> {
            return Settings.loadSettings();
        }).then(function (data: Settings.ISettings): void {
            data.remotePlatforms["ios"].should.eql(
                {
                    host: desiredState.host,
                    port: desiredState.port,
                    secure: desiredState.pin !== "",
                    mountPoint: desiredState.mountPoint
                });
        }).finally(function (): void {
            mockServer.close();
        }).done(function (): void {
            mocha();
        }, mocha);
    });

    it("should print help for unknown parameters", function (mocha: MochaDone): void {
        RemoteMod.CliSession = {
            question: function (question: string, callback: (answer: string) => void): void {
                mocha(new Error("Should not get as far as querying the user with invalid paramters"));
            },
            close: function (): void {
                mocha(new Error("Should not get as far as querying the user with invalid paramters"));
            }
        };

        Q([]).then(remoteRun).then(function (): void {
            mocha();
        }, function (e: Error): void {
            mocha(new Error("Should have printed help"));
        });
    });

    it("should be able to configure secure connections", function (mocha: MochaDone): void {
        this.timeout(20000);
        var mockServer = ServerMock.createSecureTestServer();
        var desiredState = {
            host: "localhost",
            port: 3000,
            pin: "123456",
            mountPoint: "cordova"
        };
        var expectedSequence = [
            {
                expectedUrl: "/certs/" + desiredState.pin,
                head: {
                    "Content-Type": "application/octet-stream"
                },
                statusCode: 200,
                response: fs.readFileSync(path.resolve(__dirname, "resources", "certs", "client.pfx"))
            },
            {
                expectedUrl: "/modules/taco-remote",
                head: {
                    "Content-Type": "text/plain"
                },
                statusCode: 200,
                response: desiredState.mountPoint
            },
            {
                expectedUrl: "/cordova/testCertUsage",
                head: {
                    "Content-Type": "text/plain"
                },
                statusCode: 200,
                response: "success"
            }
        ];
        var serverFunction = ServerMock.generateServerFunction(mocha, expectedSequence);
        mockServer.listen(desiredState.port);
        mockServer.on("request", serverFunction);

        RemoteMod.CliSession = RemoteMock.makeCliMock(mocha, () => { }, desiredState);
        Q(["add", "ios"]).then(remoteRun).then(function (): Q.Promise<Settings.ISettings> {
            return Settings.loadSettings();
        }).then(function (data: Settings.ISettings): Q.Promise<void> {
            data.remotePlatforms["ios"].should.eql({
                host: desiredState.host,
                port: desiredState.port,
                secure: true,
                certName: data.remotePlatforms["ios"].certName, // Ignore the certName: it is used by windows, but not by osx
                mountPoint: desiredState.mountPoint
            });
            return ConnectionSecurityHelper.getAgent(data.remotePlatforms["ios"]).then(function (agent: https.Agent): Q.Promise<any> {
                // Now that a cert is configured, try making a secure connection to the (mocked) server to make sure the cert works.
                var options: request.Options = {
                    url: Settings.getRemoteServerUrl(data.remotePlatforms["ios"]) + "/testCertUsage",
                    headers: { "Accept-Language": "en" },
                    agent: agent
                };

                var deferred = Q.defer<any>();
                request.get(options, function (err: any, response: any, body: any): void {
                    if (err) {
                        mocha(err);
                    } else {
                        deferred.resolve({});
                    }
                });
                return deferred.promise;
            });
        }).finally(function (): void {
            mockServer.close();
        }).done(function (): void {
            mocha();
        }, mocha);
    });

    describe("Onboarding experience", function (): void {
        var stdoutWrite = process.stdout.write; // We save the original implementation, so we can restore it later
        var memoryStdout: ms.MemoryStream;

        beforeEach(() => {
            memoryStdout = new ms.MemoryStream; // Each individual test gets a new and empty console
            process.stdout.write = memoryStdout.writeAsFunction(); // We'll be printing into an "in-memory" console, so we can test the output
        });

        after(() => {
            // We just need to reset the stdout just once, after all the tests have finished
            process.stdout.write = stdoutWrite;
        });

        // Here you can write to the console with logger.log(...) and then you'll be able to 
        //    retrieve the contents from the memory stream
        it("prints the onboarding experience when adding a new remote", function (done: MochaDone): void {
            this.timeout(5000);
            var desiredState = {
                host: "localhost",
                port: 3000,
                pin: "",
                mountPoint: "testMountPoint"
            };
            var expectedSequence = [
                {
                    expectedUrl: "/modules/taco-remote",
                    head: {
                        "Content-Type": "text/plain"
                    },
                    statusCode: 200,
                    response: desiredState.mountPoint
                }
            ];

            var mockServer = http.createServer();
            var serverFunction = ServerMock.generateServerFunction(done, expectedSequence);
            mockServer.listen(desiredState.port);
            mockServer.on("request", serverFunction);

            RemoteMod.CliSession = RemoteMock.makeCliMock(done, () => { }, desiredState, () => { });
            remoteRun(["add", "ios"]).finally(function (): void {
                mockServer.close();
            }).done(() => {
                var messages = ["CommandRemoteHeader",
                    "CommandRemoteSettingsStored",
                    "OnboardingExperienceTitle",
                    " * HowToUseCommandInstallReqsPlugin",
                    " * HowToUseCommandBuildPlatform",
                    " * HowToUseCommandEmulatePlatform",
                    " * HowToUseCommandRunPlatform",
                    "",
                    "HowToUseCommandHelp",
                    "HowToUseCommandDocs",
                    ""]; // Get the expected console output
                var expected = messages.join("\n");
                var actual = memoryStdout.contentsAsText();
                actual.should.be.equal(expected);
                done();
            }, done);
        });
    });
});