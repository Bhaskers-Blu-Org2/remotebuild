﻿/**
﻿ *******************************************************
﻿ *                                                     *
﻿ *   Copyright (C) Microsoft. All rights reserved.     *
﻿ *                                                     *
﻿ *******************************************************
﻿ */

import tacoUtility = require ("taco-utils");
import PlatformHelper = require ("./platformHelper");
import Settings = require ("./settings");
import Q = require ("q");

import commands = tacoUtility.Commands;
import ICommandTelemetryProperties = tacoUtility.ICommandTelemetryProperties;

var telemetryProperty: (propertyValue: any, isPii?: boolean) => tacoUtility.ITelemetryPropertyInfo = tacoUtility.TelemetryHelper.telemetryProperty;

class BuildTelemetryHelper {
    // We don't use CordovaHelper.getSupportedPlatforms() because we need to validate this even if 
    // cordova is not installed, and the white list is a good enough solution, so we just use it for all cases
    private static knownPlatforms: string[] = ["android", "ios", "amazon-fireos", "blackberry10", "browser", "firefoxos",
        "windows", "windows8", "wp8", "www"];

    private static buildAndRunNonPiiOptions: string[] = ["clean", "local", "remote", "debuginfo", "nobuild", "device", "emulator", "target", "debug", "release"];

    public static storePlatforms(telemetryProperties: ICommandTelemetryProperties, modifier: string,
        platforms: PlatformHelper.IPlatformWithLocation[], settings: Settings.ISettings): void {
        var baseName: string = "platforms." + modifier + ".";
        var remoteBaseName: string = baseName + "remote";

        if (platforms.length > 0) {
            this.encodePlatforms(telemetryProperties, baseName + "local", this.extractPlatformsList(platforms, PlatformHelper.BuildLocationType.Local));
        }

        var remotePlatforms: string[] = this.extractPlatformsList(platforms, PlatformHelper.BuildLocationType.Remote);
        if (remotePlatforms.length > 0) {
            this.encodePlatforms(telemetryProperties, remoteBaseName, remotePlatforms);
        }

        remotePlatforms.forEach((platform: string) => {
            if (settings.remotePlatforms && settings.remotePlatforms[platform]) {
                telemetryProperties["platforms.remote." + platform + ".is_secure"] = telemetryProperty(settings.remotePlatforms[platform].secure, /*isPii*/ false);
            }
        });
    }

    public static addCommandLineBasedPropertiesForBuildAndRun(telemetryProperties: ICommandTelemetryProperties, knownOptions: Nopt.CommandData,
        commandData: commands.ICommandData): Q.Promise<ICommandTelemetryProperties> {
        return Settings.loadSettingsOrReturnEmpty().then((settings: Settings.ISettings) => {

            var properties: ICommandTelemetryProperties = tacoUtility.TelemetryHelper.addPropertiesFromOptions(telemetryProperties,
                knownOptions, commandData.options, this.buildAndRunNonPiiOptions);

            return PlatformHelper.determinePlatformsFromOptions(commandData).then((platforms: PlatformHelper.IPlatformWithLocation[]) => {
                var requestedPlatforms: string[] = PlatformHelper.parseRequestedPlatforms(commandData);
                var requestedUsedPlatforms: PlatformHelper.IPlatformWithLocation[] = platforms
                    .filter((platform: PlatformHelper.IPlatformWithLocation): boolean => requestedPlatforms.indexOf(platform.platform) !== -1);

                this.storePlatforms(properties, "requestedViaCommandLine", requestedUsedPlatforms, settings);
                return properties;
            });
        });
    }

    public static getIsPlatformPii(): { (platform: string): boolean } {
        return (platform: string) => this.knownPlatforms.indexOf(platform.toLocaleLowerCase()) < 0;
    }

    /*
     * Encode platform with pii or npii as required
     */
    private static encodePlatforms(telemetryProperties: ICommandTelemetryProperties, baseName: string, platforms: string[]): void {
        var platformIndex: number = 1; // This is a one-based index
        platforms.forEach((platform: string) => {
            telemetryProperties[baseName + platformIndex++] = telemetryProperty(platform, BuildTelemetryHelper.getIsPlatformPii()(platform));
        });
    }

    private static extractPlatformsList(platforms: PlatformHelper.IPlatformWithLocation[], buildLocationType: PlatformHelper.BuildLocationType): string[] {
        return platforms
        .filter((platform: PlatformHelper.IPlatformWithLocation) => platform.location === buildLocationType)
        .map((platform: PlatformHelper.IPlatformWithLocation) => platform.platform);
    }
}

export = BuildTelemetryHelper;
