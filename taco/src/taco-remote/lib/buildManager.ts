﻿/**
﻿ *******************************************************
﻿ *                                                     *
﻿ *   Copyright (C) Microsoft. All rights reserved.     *
﻿ *                                                     *
﻿ *******************************************************
﻿ */

/// <reference path="../../typings/express.d.ts" />
/// <reference path="../../typings/expressExtensions.d.ts" />
/// <reference path="../../typings/fstream.d.ts" />
/// <reference path="../../typings/node.d.ts" />
/// <reference path="../../typings/tacoRemoteLib.d.ts" />
/// <reference path="../../typings/tacoUtils.d.ts" />
/// <reference path="../../typings/tar.d.ts" />
/// <reference path="./requestRedirector.ts" />
"use strict";

import child_process = require ("child_process");
import express = require ("express");
import fs = require ("fs");
import path = require ("path");
import Q = require ("q");
import tar = require ("tar");
import zlib = require ("zlib");

import BuildRetention = require ("./buildRetention");
import resources = require ("../resources/resourceManager");
import TacoRemoteConfig = require ("./tacoRemoteConfig");
import utils = require ("taco-utils");

import BuildInfo = utils.BuildInfo;

interface IBuildMetrics {
    submitted: number;
    accepted: number;
    rejected: number;
    failed: number;
    succeeded: number;
    downloaded: number;
};

class BuildManager {
    private baseBuildDir: string;
    private maxBuildsInQueue: number;
    private nextBuildNumber: number;
    private deleteBuildsOnShutdown: boolean;
    private builds: { [idx: string]: BuildInfo };
    private currentBuild: BuildInfo;
    private queuedBuilds: BuildInfo[];
    private buildMetrics: IBuildMetrics;
    private requestRedirector: TacoRemoteLib.IRequestRedirector;
    private serverConf: TacoRemoteConfig;
    private buildRetention: BuildRetention;

    constructor(conf: TacoRemoteConfig) {
        this.serverConf = conf;
        this.baseBuildDir = path.resolve(process.cwd(), conf.serverDir, "taco-remote", "builds");
        utils.UtilHelper.createDirectoryIfNecessary(this.baseBuildDir);
        this.maxBuildsInQueue = conf.maxBuildsInQueue;
        this.deleteBuildsOnShutdown = conf.deleteBuildsOnShutdown;
        var allowsEmulate = conf.allowsEmulate;

        try {
            this.requestRedirector = require(conf.get("redirector"));
        } catch (e) {
            this.requestRedirector = require("./requestRedirector");
        }

        this.buildRetention = new BuildRetention(this.baseBuildDir, conf);
        // For now, using process startup pid as the initial build number is good enough to avoid collisions with prior server runs against 
        // the same base build dir, especially when build cleanup is used.
        this.nextBuildNumber = process.pid;
        this.builds = {};
        this.buildMetrics = {
            submitted: 0,
            accepted: 0,
            rejected: 0,
            failed: 0,
            succeeded: 0,
            downloaded: 0
        };
        this.currentBuild = null;
        this.queuedBuilds = [];
    }

    public shutdown(): void {
        if (this.deleteBuildsOnShutdown) {
            this.buildRetention.deleteAllSync(this.builds);
        }
    }

    public submitNewBuild(req: express.Request): Q.Promise<BuildInfo> {
        console.info(resources.getString("NewBuildSubmitted"));
        console.info(req.url);
        console.info(req.headers);

        this.buildMetrics.submitted++;

        if (this.queuedBuilds.length === this.maxBuildsInQueue) {
            var message = resources.getString("BuildQueueFull", this.maxBuildsInQueue);
            var error: any = new Error(message);
            error.code = 503;
            throw error;
        }

        // For now these are part of the request query (after the ?) but might look to make these part of the path, or headers, as most are not really optional parameters
        var buildCommand: string = req.query.command || "build";
        var configuration: string = req.query.cfg || "release";
        var options: string = req.query.options || "";
        var buildNumber: number = req.query.buildNumber || null;
        var buildPlatform: string = req.query.platform || "ios";
        var logLevel: string = req.query.logLevel || null;

        var self = this;
        return this.requestRedirector.getPackageToServeRequest(req).then(function (pkg: TacoRemoteLib.IRemoteLib): Q.Promise<BuildInfo> {
            pkg.init(self.serverConf);
            var errors: string[] = [];
            if (!pkg.validateBuildRequest(req, errors)) {
                self.buildMetrics.rejected++;
                return Q.reject<BuildInfo>(errors);
            }

            self.buildMetrics.accepted++;

            if (!buildNumber) {
                buildNumber = ++self.nextBuildNumber;
            }

            var buildDir = path.join(self.baseBuildDir, "" + buildNumber);
            if (!fs.existsSync(buildDir)) {
                fs.mkdirSync(buildDir);
            }

            console.info(resources.getString("BuildManagerDirInit", buildDir));

            // Pass the build query to the buildInfo, for package-specific config options
            var params = req.query;
            params.status = BuildInfo.UPLOADING;
            params.buildCommand = buildCommand;
            params.buildPlatform = buildPlatform;
            params.configuration = configuration;
            params.buildLang = req.headers["accept-language"];
            params.buildDir = buildDir;
            params.buildNumber = buildNumber;
            params.options = options;
            params.logLevel = logLevel;
            var buildInfo = new BuildInfo(params);
            // Associate the buildInfo object with the package used to service it, but without changing the JSON representation;
            Object.defineProperty(buildInfo, "pkg", { enumerable: false, writable: true, configurable: true });
            buildInfo["pkg"] = pkg;

            self.builds[buildNumber] = buildInfo;

            var deferred = Q.defer<BuildInfo>();
            self.saveUploadedTgzFile(buildInfo, req, function (err: any, result: any): void {
                if (err) {
                    deferred.reject(err);
                } else {
                    deferred.resolve(buildInfo);
                    self.beginBuild(req, buildInfo);
                }
            });
            return deferred.promise;
        });
    }

    public getBuildInfo(id: number): BuildInfo {
        return this.builds[id] || null;
    }

    public downloadBuildLog(id: number, offset: number, res: express.Response): void {
        var buildInfo = this.builds[id];
        if (!buildInfo) {
            res.end();
            return;
        }

        var buildLog = path.join(buildInfo.buildDir, "build.log");
        if (!fs.existsSync(buildLog)) {
            res.end();
            return;
        }

        var logStream = fs.createReadStream(buildLog, { start: offset });
        logStream.on("error", function (err: any): void {
            console.info(resources.getString("LogFileReadError"));
            console.info(err);
        });
        logStream.pipe(res);
    }

    public getAllBuildInfo(): { metrics: any; queued: number; currentBuild: BuildInfo; queuedBuilds: BuildInfo[]; allBuilds: any } {
        return {
            metrics: this.buildMetrics,
            queued: this.queuedBuilds.length,
            currentBuild: this.currentBuild,
            queuedBuilds: this.queuedBuilds,
            allBuilds: this.builds
        };
    }

    // Downloads the requested build.
    public downloadBuild(buildInfo: BuildInfo, req: express.Request, res: express.Response): void {
        var self = this;
        if (!buildInfo["pkg"]) {
            res.status(404).send(resources.getStringForLanguage(req, "MalformedBuildInfo"));
            return;
        }

        buildInfo["pkg"].downloadBuild(buildInfo, req, res, function (err: any): void {
            if (!err) {
                self.buildMetrics.downloaded++;
                buildInfo.updateStatus(BuildInfo.DOWNLOADED);
            }
        });
    }

    public getBaseBuildDir(): string {
        return this.baseBuildDir;
    }

    public emulateBuild(buildInfo: BuildInfo, req: express.Request, res: express.Response): void {
        if (!utils.ArgsHelper.argToBool(this.serverConf.allowsEmulate)) {
            res.status(403).send(resources.getStringForLanguage(req, "EmulateDisabled"));
            return;
        }

        if (!buildInfo["pkg"]) {
            res.status(404).send(resources.getStringForLanguage(req, "MalformedBuildInfo"));
            return;
        }

        buildInfo["pkg"].emulateBuild(buildInfo, req, res);
    }

    public deployBuild(buildInfo: BuildInfo, req: express.Request, res: express.Response): void {
        if (!buildInfo["pkg"]) {
            res.status(404).send(resources.getStringForLanguage(req, "MalformedBuildInfo"));
            return;
        }

        buildInfo["pkg"].deployBuild(buildInfo, req, res);
    }

    public runBuild(buildInfo: BuildInfo, req: express.Request, res: express.Response): void {
        if (!buildInfo["pkg"]) {
            res.status(404).send(resources.getStringForLanguage(req, "MalformedBuildInfo"));
            return;
        }

        buildInfo["pkg"].runBuild(buildInfo, req, res);
    }

    public debugBuild(buildInfo: BuildInfo, req: express.Request, res: express.Response): void {
        if (!buildInfo["pkg"]) {
            res.status(404).send(resources.getStringForLanguage(req, "MalformedBuildInfo"));
            return;
        }

        buildInfo["pkg"].debugBuild(buildInfo, req, res);
    }

    private saveUploadedTgzFile(buildInfo: BuildInfo, req: express.Request, callback: Function): void {
        var self = this;
        console.info(resources.getString("UploadSaving", buildInfo.buildDir));
        buildInfo.tgzFilePath = path.join(buildInfo.buildDir, "upload_" + buildInfo.buildNumber + ".tgz");
        var tgzFile = fs.createWriteStream(buildInfo.tgzFilePath);
        req.pipe(tgzFile);
        tgzFile.on("finish", function (): void {
            buildInfo.updateStatus(BuildInfo.UPLOADED);
            console.info(resources.getString("UploadSavedSuccessfully", buildInfo.tgzFilePath));
            callback(null, buildInfo);
        });
        tgzFile.on("error", function (err: Error): void {
            buildInfo.updateStatus(BuildInfo.ERROR, "ErrorSavingTgz", tgzFile, err.message);
            console.error(resources.getString("ErrorSavingTgz", tgzFile, err));
            self.buildMetrics.failed++;
            callback(err, buildInfo);
        });
    }

    private beginBuild(req: express.Request, buildInfo: BuildInfo): void {
        var self = this;
        var extractToDir = path.join(buildInfo.buildDir, "cordovaApp");
        buildInfo.buildSuccessful = false;
        buildInfo.appDir = extractToDir;
        try {
            if (!fs.existsSync(extractToDir)) {
                fs.mkdirSync(extractToDir);
            }
        } catch (e) {
            buildInfo.updateStatus(BuildInfo.ERROR, resources.getStringForLanguage(req, "FailedCreateDirectory", extractToDir, e.message));
            console.error(resources.getString("FailedCreateDirectory", extractToDir, e.message));
            self.buildMetrics.failed++;
            return;
        }

        if (!fs.existsSync(buildInfo.tgzFilePath)) {
            buildInfo.updateStatus(BuildInfo.ERROR, resources.getStringForLanguage(req, "NoTgzFound", buildInfo.tgzFilePath));
            console.error(resources.getString("NoTgzFound", buildInfo.tgzFilePath));
            self.buildMetrics.failed++;
            return;
        }

        var onError = function (err: Error): void {
            buildInfo.updateStatus(BuildInfo.ERROR, resources.getStringForLanguage(req, "TgzExtractError", buildInfo.tgzFilePath, err.message));
            console.info(resources.getString("TgzExtractError", buildInfo.tgzFilePath, err.message));
            self.buildMetrics.failed++;
        };

        // A tar file created on windows has no notion of 'rwx' attributes on a directory, so directories are not executable when 
        // extracting to unix, causing the extract to fail because the directory cannot be navigated. 
        // Also, the tar module does not handle an 'error' event from it's underlying stream, so we have no way of catching errors like an unwritable
        // directory in the tar gracefully- they cause an uncaughtException and server shutdown. For safety sake we force 'rwx' for all on everything.
        var tarFilter = function (who: Fstream.Writer): boolean {
            who.props.mode = 511; // "chmod 777"

            // Do not include the /plugins folder
            return !who.props.path.match(/plugins/);
        };

        var pluginsOnlyFilter = function (who: Fstream.Writer): boolean {
            who.props.mode = 511; // "chmod 0777"

            return !who.props.depth || (who.props.depth === 0 && who.props.Directory) || !!who.props.path.match(/plugins/);
        };

        var extractDeferred = Q.defer();
        var extractPluginDeferred = Q.defer();
        // strip: 1 means take the top level directory name off when extracting (we want buildInfo.appDir to be the top level dir.)
        var tarExtractor = tar.Extract({ path: extractToDir, strip: 1, filter: tarFilter });
        tarExtractor.on("end", function (): void {
            self.removeDeletedFiles(buildInfo);
            extractDeferred.resolve({});
        });
        var pluginExtractor = tar.Extract({ path: path.join(extractToDir, "remote"), strip: 1, filter: pluginsOnlyFilter });
        pluginExtractor.on("end", function (): void {
            extractPluginDeferred.resolve({});
        });

        var unzip = zlib.createGunzip();
        var tgzStream = fs.createReadStream(buildInfo.tgzFilePath);
        tarExtractor.on("error", onError);
        pluginExtractor.on("error", onError);
        unzip.on("error", onError);
        tgzStream.on("error", onError);
        tgzStream.pipe(unzip);
        unzip.pipe(tarExtractor).on("error", onError);
        unzip.pipe(pluginExtractor).on("error", onError);

        Q.all([extractDeferred.promise, extractPluginDeferred.promise]).then(function (): void {
            buildInfo.updateStatus(BuildInfo.EXTRACTED);
            console.info(resources.getString("UploadExtractedSuccessfully", extractToDir));
            self.build(buildInfo);
        });
    }

    private removeDeletedFiles(buildInfo: BuildInfo): void {
        var changeListFile = path.join(buildInfo.appDir, "changeList.json");
        if (fs.existsSync(changeListFile)) {
            buildInfo.changeList = JSON.parse(fs.readFileSync(changeListFile, { encoding: "utf-8" }));
            if (buildInfo.changeList) {
                buildInfo.changeList.deletedFiles.forEach(function (deletedFile: string): void {
                    if (!deletedFile.match(/^plugins[\/]/)) {
                        // Don't remove files within the plugins folder; they should be cordova plugin remove'd later on
                        var fileToDelete: string = path.join(buildInfo.appDir, path.normalize(deletedFile));

                        if (fs.existsSync(fileToDelete)) {
                            fs.unlinkSync(fileToDelete);
                        }
                    }
                });
            }
        }
    }

    // build may change the current working directory to the app dir. To build multiple builds in parallel we will
    // need to fork out child processes. For now, limiting to one build at a time, and queuing up new builds that come in while a current build is in progress.
    private build(buildInfo: BuildInfo): void {
        var self = this;
        if (self.currentBuild) {
            console.info(resources.getString("NewBuildQueued", buildInfo.buildNumber));
            self.queuedBuilds.push(buildInfo);
            return;
        } else {
            console.info(resources.getString("NewBuildStarted", buildInfo.buildNumber));
            self.currentBuild = buildInfo;
        }

        // Good point to purge old builds
        this.buildRetention.purge(self.builds);

        if (!fs.existsSync(buildInfo.appDir)) {
            console.info(resources.getString("BuildDirectoryNotFound", buildInfo.buildDir));
            buildInfo.updateStatus(BuildInfo.ERROR, "BuildDirectoryNotFound", buildInfo.buildDir);
            self.buildMetrics.failed++;
            self.dequeueNextBuild();
            return;
        }

        if (!buildInfo["pkg"]) {
            buildInfo.updateStatus(BuildInfo.ERROR, "MalformedBuildInfo");
            self.dequeueNextBuild();
        } else {
            buildInfo["pkg"].build(buildInfo, function (resultBuildInfo: BuildInfo): void {
                buildInfo.updateStatus(resultBuildInfo.status, resultBuildInfo.messageId, resultBuildInfo.messageArgs);
                if (buildInfo.status === BuildInfo.COMPLETE) {
                    self.buildMetrics.succeeded++;
                    buildInfo.buildSuccessful = true;
                } else if (buildInfo.status === BuildInfo.INVALID) {
                    self.buildMetrics.rejected++;
                } else {
                    self.buildMetrics.failed++;
                }

                self.dequeueNextBuild();
            });
        }
    }

    private dequeueNextBuild(): void {
        console.info(resources.getString("BuildMovingOn"));
        this.currentBuild = null;
        var nextBuild = this.queuedBuilds.shift();
        if (nextBuild) {
            this.build(nextBuild);
        }
    }
}

export = BuildManager;
