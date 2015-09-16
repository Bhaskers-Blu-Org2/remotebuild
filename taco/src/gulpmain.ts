﻿/// <reference path="typings/node.d.ts" />
/// <reference path="typings/Q.d.ts" />
/// <reference path="typings/gulp.d.ts" />
/// <reference path="typings/gulpExtensions.d.ts" />
/// <reference path="typings/nopt.d.ts" />
/// <reference path="typings/merge2.d.ts" />
/// <reference path="typings/gulp-typescript.d.ts" />
/// <reference path="typings/gulp-sourcemaps.d.ts" />
/// <reference path="typings/replace.d.ts" />

var runSequence = require("run-sequence");
import gulp = require ("gulp");
import sourcemaps = require ("gulp-sourcemaps");
import ts = require ("gulp-typescript");
import merge = require ("merge2");
import nopt = require ("nopt");
import path = require ("path");
import Q = require ("q");
import replace = require ("replace");

import gulpUtils = require ("../tools/GulpUtils");
 
var buildConfig = require("../../src/build_config.json");
var tacoModules = ["taco-utils", "taco-kits", "taco-dependency-installer", "taco-cli", "remotebuild", "taco-remote", "taco-remote-lib"];
var allModules = tacoModules.concat(["taco-remote-multiplexer"]);

// honour --moduleFilter flag.
// gulp --moduleFilter taco-cli will build/install/run tests only for taco-cli
var options: any = nopt({ moduleFilter: String, drop: String }, {}, process.argv);
if (options.moduleFilter && tacoModules.indexOf(options.moduleFilter) > -1) {
    tacoModules = [options.moduleFilter];
}

/* Default task for building /src folder into /bin */
gulp.task("default", ["install-build"]);

/* Compiles the typescript files in the project, for fast iterative use */
gulp.task("compile", function (callback: Function): Q.Promise<any> {
    return gulpUtils.streamToPromise(gulp.src([buildConfig.src + "/**/*.ts", "!" + buildConfig.src + "/gulpmain.ts"])
        .pipe(sourcemaps.init())
        .pipe(ts(buildConfig.tsCompileOptions))
        .pipe(sourcemaps.write("."))
        .pipe(gulp.dest(buildConfig.buildPackages)));
});

/* compile + copy */
gulp.task("build", ["prepare-templates"], function (callback: Function): void {
    runSequence("compile", "copy", callback);
});

gulp.task("package", [], function (callback: Function): void {
    runSequence("build", "just-package", callback);
});

gulp.task("just-package", [], function (): Q.Promise<any> {
    return Q.all([
        gulpUtils.updateLocalPackageFilePaths("/**/package.json", buildConfig.src, buildConfig.buildPackages, options.drop || buildConfig.buildPackages),
        gulpUtils.copyDynamicDependenciesJson("/**/dynamicDependencies.json", buildConfig.src, buildConfig.buildPackages, options.drop, true)
    ]).then(function (): Q.Promise<any> {
        // npm pack each folder, put the tgz in the parent folder
        return gulpUtils.packageModules(buildConfig.buildPackages, allModules, options.drop || buildConfig.buildPackages);
    }).catch(function (err: any): any {
        console.error("Error packaging: " + err);
        throw err;
    });
});

/* full clean build */
gulp.task("rebuild", function (callback: Function): void {
    runSequence("clean", "build", callback);
});

/* Task to install the compiled modules */
gulp.task("install-build", ["package"], function (): Q.Promise<any> {
    return gulpUtils.installModules(tacoModules, buildConfig.buildPackages);
});

/* Cleans up the build location, will have to call "gulp prep" again */
gulp.task("clean", ["uninstall-build"], function (): void {
});

/* Task to install the compiled modules */
gulp.task("uninstall-build", [], function (): Q.Promise<any> {
    return gulpUtils.uninstallModules(tacoModules, buildConfig.buildPackages);
});

/* Cleans up only the templates in the build folder */
gulp.task("clean-templates", function (callback: (err: Error) => void): void {
    gulpUtils.deleteDirectoryRecursive(path.resolve(buildConfig.buildTemplates), callback);
});

/* copy package.json and resources.json files from source to bin */
gulp.task("copy", function (): Q.Promise<any> {
    // Note: order matters, and later inclusions/exclusions take precedence over earlier ones.
    var filesToCopy: string[] = [
        "/**",
        "!/typings/**",
        "!/**/*.ts",
        "/*/.npmignore",
        "/**/templates/**",
        "/**/examples/**",
        "!/**/dynamicDependencies.json"
    ].map(val => val[0] === "!" ? "!" + path.join(buildConfig.src, val.substring(1)) : path.join(buildConfig.src, val));

    return Q.all([
        gulpUtils.copyFiles(filesToCopy, buildConfig.buildPackages),
        gulpUtils.copyDynamicDependenciesJson("/**/dynamicDependencies.json", buildConfig.src, buildConfig.buildPackages, options.drop && path.join(options.drop, "node_modules"))
    ]);
});

/* Task to run tests */
gulp.task("run-tests", ["install-build"], function (): Q.Promise<any> {
    return gulpUtils.runAllTests(tacoModules, buildConfig.buildPackages);
});

/* Task to archive template folders */
gulp.task("prepare-templates", ["clean-templates"], function (): Q.Promise<any> {
    return gulpUtils.prepareTemplates(buildConfig.templates, buildConfig.buildTemplates);
});

module.exports = gulp;
