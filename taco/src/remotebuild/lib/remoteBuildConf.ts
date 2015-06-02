﻿/**
﻿ *******************************************************
﻿ *                                                     *
﻿ *   Copyright (C) Microsoft. All rights reserved.     *
﻿ *                                                     *
﻿ *******************************************************
﻿ */

/// <reference path="../../typings/remotebuild.d.ts" />
"use strict";

import nconf = require ("nconf");
import os = require ("os");
import path = require ("path");

import HostSpecifics = require ("./hostSpecifics");
import resources = require ("../resources/resourceManager");
import tacoUtils = require ("taco-utils");

import UtilHelper = tacoUtils.UtilHelper;

class RemoteBuildConf implements RemoteBuild.IRemoteBuildConfiguration {
    private remoteBuildConf: {
        lang: string;
        port: number;
        serverDir: string;
        secure: boolean;
        pinTimeout: number;
        hostname: string;
        certExpirationDays: number;

        modules: RemoteBuildConf.IModulesConf;

        [key: string]: any;
    };

    constructor(conf: typeof nconf, isUnitTest?: boolean) {
        var defaults: any = {
            serverDir: path.join(UtilHelper.tacoHome, "remote-builds"),
            port: 3000,
            secure: true,
            pinTimeout: 10,
            hostname: os.hostname()
        };

        defaults = HostSpecifics.hostSpecifics.defaults(defaults);
        conf.defaults(defaults);

        if (process.env.HOME) {
            // We don't get expansion of ~ or ~user by default
            // To support the simple case of "my home directory" I'm doing the replacement here
            // We only want to expand if the directory starts with ~/ not in cases such as /foo/~
            // Ideally we would also cope with the case of ~user/ but that is harder to find and probably less common
            var serverDir = conf.get("serverDir");
            conf.set("serverDir", serverDir.replace(/^~(?=\/|^)/, process.env.HOME));
        }

        this.remoteBuildConf = conf.get();
        process.env.LANG = this.lang;

        var serverMods = this.remoteBuildConf.modules;
        if (typeof (serverMods) !== "object" || Object.keys(serverMods).length === 0) {
            console.warn(resources.getString("NoServerModulesSelected"));
            if (isUnitTest) {
                this.remoteBuildConf.modules = { };
            } else {
                this.remoteBuildConf.modules = {
                    "taco-remote": { mountPath: "cordova" }
                };
            }
        }
    }

    /**
     * @name config
     * @LOCTAG RemoteBuildConfConfig
     */
    // This getter is never used in code, but we do want to document the parameter.
    public get config(): string {
        return this.remoteBuildConf["config"];
    }

    /**
     * @name serverDir
     * @LOCTAG RemoteBuildConfServerDir
     */
    public get serverDir(): string {
        return this.remoteBuildConf.serverDir;
    }

    /**
     * @name lang
     * @LOCTAG RemoteBuildConfLang
     */
    public get lang(): string {
        return this.remoteBuildConf.lang;
    }

    /**
     * @name port
     * @LOCTAG RemoteBuildConfPort
     */
    public get port(): number {
        return this.remoteBuildConf.port;
    }

    /**
     * @name secure
     * @LOCTAG RemoteBuildConfSecure
     */
    public get secure(): boolean {
        return tacoUtils.ArgsHelper.argToBool(this.remoteBuildConf.secure);
    }

    /**
     * @name pinTimeout
     * @LOCTAG RemoteBuildConfPinTimeout
     */
    public get pinTimeout(): number {
        return this.remoteBuildConf.pinTimeout;
    }

    /**
     * @name hostname
     * @LOCTAG RemoteBuildConfHostname
     */
    public get hostname(): string {
        return this.remoteBuildConf.hostname;
    }

    /**
     * @name certExpirationDays
     * @LOCTAG RemoteBuildConfCertExpirationDays
     */
    public get certExpirationDays(): number {
        return this.remoteBuildConf.certExpirationDays;
    }

// This is not something that should be specified on the command line directly, although it can be if you try hard enough
    public get modules(): string[] {
        return Object.keys(this.remoteBuildConf.modules);
    }

    public get(prop: string): any {
        return this.remoteBuildConf[prop];
    }

    public set(prop: string, val: any): void {
        this.remoteBuildConf[prop] = val;
    }

    public moduleConfig(mod: string): RemoteBuildConf.IModuleConf {
        return this.remoteBuildConf.modules[mod];
    }
}

module RemoteBuildConf {
    export interface IModuleConf {
        mountPath: string;
        requirePath?: string;
        [prop: string]: any;
    };
    export interface IModulesConf {
        [module: string]: RemoteBuildConf.IModuleConf;
    };
}

export = RemoteBuildConf;
