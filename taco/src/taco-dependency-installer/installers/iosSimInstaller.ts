/**
 *******************************************************
 *                                                     *
 *   Copyright (C) Microsoft. All rights reserved.     *
 *                                                     *
 *******************************************************
 */

/// <reference path="../../typings/dependencyInstallerInterfaces.d.ts" />
/// <reference path="../../typings/Q.d.ts" />

/// <disable code="SA1400" justification="protected statements are currently broken in StyleCop" />

"use strict";

import childProcess = require ("child_process");
import Q = require ("q");

import InstallerBase = require ("./installerBase");
import installerProtocol = require ("../elevatedInstallerProtocol");
import installerUtils = require ("../utils/installerUtils");

import ILogger = installerProtocol.ILogger;

class IosSimInstaller extends InstallerBase {
    constructor(installerInfo: DependencyInstallerInterfaces.IInstallerData, softwareVersion: string, installTo: string, logger: ILogger, steps: DependencyInstallerInterfaces.IStepsDeclaration) {
        super(installerInfo, softwareVersion, installTo, logger, steps, "ios-sim");
    }

    protected installWin32(): Q.Promise<any> {
        return this.installDefault();
    }

    protected installDarwin(): Q.Promise<any> {
        return this.installDefault();
    }

    private installDefault(): Q.Promise<any> {
        return installerUtils.installNpmPackage(this.installerInfo.installSource);
    }
}

export = IosSimInstaller;

/// <enable code="SA1400" />