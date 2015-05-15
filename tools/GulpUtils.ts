/// <reference path="../src/typings/node.d.ts" />
/// <reference path="../src/typings/Q.d.ts" />
/// <reference path="../src/typings/tar.d.ts" />
/// <reference path="../src/typings/fstream.d.ts" />
/// <reference path="../src/typings/del.d.ts" />
/// <reference path="../src/typings/archiver.d.ts" />
/// <reference path="../src/typings/gulp.d.ts" />
/// <reference path="../src/typings/jsdoc-parse.d.ts" />

import archiver = require ("archiver");
import child_process = require ("child_process");
import del = require ("del");
import fs = require ("fs");
import fstream = require ("fstream");
import gulp = require ("gulp");
import parse = require ("jsdoc-parse");
import os = require ("os");
import path = require ("path");
import Q = require ("q");
import util = require ("util");
import zlib = require ("zlib")

class GulpUtils {
    private static TestCommand: string = "test";

    public static runAllTests(modulesToTest: string[], modulesRoot: string): Q.Promise<any> {
        return modulesToTest.reduce(function (soFar: Q.Promise<any>, val: string): Q.Promise<any> {
            return soFar.then(function (): Q.Promise<any> {

                var modulePath = path.resolve(modulesRoot, val);
                // check if package has any tests
                var pkg = require(path.join(modulePath, "package.json"));
                if (!pkg.scripts || !(GulpUtils.TestCommand in pkg.scripts)) {
                    return Q({});
                }

                var npmCommand = "npm" + (os.platform() === "win32" ? ".cmd" : "");
                var testProcess = child_process.spawn(npmCommand, [GulpUtils.TestCommand], { cwd: modulePath, stdio: "inherit" });
                var deferred = Q.defer();
                testProcess.on("close", function (code: number): void {
                    if (code) {
                        deferred.reject("Test failed for " + modulePath);
                    } else {
                        deferred.resolve({});
                    }
                });
                return deferred.promise;
            });
        }, Q({}))
    }

    public static installModules(modulesToInstall: string[], modulesRoot: string): Q.Promise<any> {
        return modulesToInstall.reduce(function (soFar: Q.Promise<any>, val: string): Q.Promise<any> {
            return soFar.then(function (): Q.Promise<any> {
                return GulpUtils.installModule(path.resolve(modulesRoot, val));
            });
        }, Q({}))
    }

    public static uninstallModules(modulesToUninstall: string[], installRoot: string): Q.Promise<any> {
        return modulesToUninstall.reduce(function (soFar: Q.Promise<any>, val: string): Q.Promise<any> {
            return soFar.then(function (): Q.Promise<any> {
                return GulpUtils.uninstallModule(val, installRoot);
            });
        }, Q({}))
    }

    public static copyFiles(pathsToCopy: string[], srcPath: string, destPath: string): Q.Promise<any> {
        return Q.all(pathsToCopy.map(function (val: string): Q.Promise<any> {
            return GulpUtils.streamToPromise(gulp.src(path.join(srcPath, val)).pipe(gulp.dest(destPath)));
        }));
    }

    public static deleteDirectoryRecursive(dirPath: string, callback: (err: Error, deletedFiles: string[]) => any) {
        console.warn(util.format("Deleting %s", dirPath));
        del([dirPath + "/**"], { force: true }, callback);
    }

    public static prepareTemplates(templatesSrc: string, templatesDest: string): Q.Promise<any> {
        var buildTemplatesPath: string = path.resolve(templatesDest);
        var promises: Q.Promise<any>[] = [];

        GulpUtils.mkdirp(buildTemplatesPath);

        // Read the templates dir to discover the different kits
        var templatesPath: string = templatesSrc;
        var kits: string[] = GulpUtils.getChildDirectoriesSync(templatesPath);

        kits.forEach(function (kitValue: string, index: number, array: string[]): void {
            // Read the kit's dir for all the available templates
            var kitSrcPath: string = path.join(templatesSrc, kitValue);
            var kitTargetPath: string = path.join(buildTemplatesPath, kitValue);

            GulpUtils.mkdirp(kitTargetPath);

            var kitTemplates: string[] = GulpUtils.getChildDirectoriesSync(kitSrcPath);

            kitTemplates.forEach(function (templateValue: string, index: number, array: string[]): void {
                // Create the template's archive
                var templateSrcPath: string = path.resolve(kitSrcPath, templateValue);
                var templateTargetPath: string = path.join(kitTargetPath, templateValue + ".zip");
                var archive: any = archiver("zip");
                var outputStream: NodeJS.WritableStream = fs.createWriteStream(templateTargetPath);
                var deferred: Q.Deferred<any> = Q.defer<any>();

                archive.on("error", function (err: Error): void {
                    deferred.reject(err);
                });

                outputStream.on("close", function (): void {
                    deferred.resolve({});
                });

                archive.pipe(outputStream);

                // Note: archiver.bulk() automatically ignores files starting with "."; if this behavior ever changes, or if a different package is used
                // to archive the templates, some logic to exclude the ".taco-ignore" files found in the templates will need to be added here
                archive.bulk({ expand: true, cwd: path.join(templatesPath, kitValue), src: [templateValue + "/**"] }).finalize();
                promises.push(deferred.promise);
            });
        });

        return Q.all(promises);
    }

    public static prepareJsdocJson(filename: string): Q.Promise<any> {
        var outName = path.join(path.dirname(filename), util.format("%s.jsdoc.json", path.basename(filename, ".js")));
        return GulpUtils.streamToPromise(parse({ src: filename }).pipe(fs.createWriteStream(outName)));
    }

    public static streamToPromise(stream: NodeJS.ReadWriteStream|NodeJS.WritableStream): Q.Promise<any> {
        var deferred = Q.defer();
        stream.on("finish", function (): void {
            deferred.resolve({});
        });
        stream.on("error", function (e: Error): void {
            deferred.reject(e);
        });
        return deferred.promise;
    }

    private static installModule(modulePath: string): Q.Promise<any> {
        console.log("Installing " + modulePath);
        var deferred = Q.defer<Buffer>();
        child_process.exec("npm install", { cwd: modulePath }, deferred.makeNodeResolver());
        return deferred.promise;
    }

    private static uninstallModule(moduleName: string, installDir: string): Q.Promise<any> {
        if (!fs.existsSync(path.join(installDir, moduleName, "package.json"))){
            return Q({});
        }

        // move one level up so that we run npm install from build\packages\
        installDir = path.join(installDir, "..");

        console.log("Uninstalling " + moduleName);
        var deferred = Q.defer<Buffer>();
        child_process.exec("npm uninstall " + moduleName, { cwd: installDir }, deferred.makeNodeResolver());
        return deferred.promise;
    }

    private static getChildDirectoriesSync(dir: string): string[]{
        return fs.readdirSync(dir).filter(function (entry: string): boolean {
            return fs.statSync(path.resolve(dir, entry)).isDirectory();
        });
    }

    private static mkdirp(dir: string): void {
        var folders = dir.split(path.sep);
        var start = folders.shift();
        folders.reduce(function (soFar: string, currentFolder: string): string {
            var folder = path.join(soFar, currentFolder);
            if (!fs.existsSync(folder)) {
                fs.mkdirSync(folder);
            }
            return folder;
        }, start + path.sep);
    }
}

export = GulpUtils;