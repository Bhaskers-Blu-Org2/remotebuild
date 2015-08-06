﻿/**
﻿ *******************************************************
﻿ *                                                     *
﻿ *   Copyright (C) Microsoft. All rights reserved.     *
﻿ *                                                     *
﻿ *******************************************************
﻿ */

/// <reference path="../typings/Q.d.ts" />
/// <reference path="../typings/tacoUtils.d.ts" />
/// <reference path="../typings/tacoKits.d.ts" />

"use strict";
import fs = require ("fs");
import path = require ("path");
import Q = require ("q");

import resources = require ("./resources/resourceManager");
import tacoErrorCodes = require ("./tacoErrorCodes");
import errorHelper = require ("./tacoErrorHelper");
import tacoUtility = require ("taco-utils");

import logger = tacoUtility.Logger;
import TacoErrorCodes = tacoErrorCodes.TacoErrorCode;

module TacoKits {
    export interface IKitHelper {
        kitMetadataFilePath?: string;
        getKitMetadata?: () => Q.Promise<ITacoKitMetadata>;
        getKitInfo?: (kitId: string) => Q.Promise<IKitInfo>;
        getDefaultKit?: () => Q.Promise<string>;
        getValidCordovaCli?: (kitId: string) => Q.Promise<string>;
        getCordovaCliForKit?: (kitId: string) => Q.Promise<string>;
        getPlatformOverridesForKit?: (kitId: string) => Q.Promise<IPlatformOverrideMetadata>;
        getPluginOverridesForKit?: (kitId: string) => Q.Promise<IPluginOverrideMetadata>;
        getTemplateOverrideInfo?: (kitId: string, templateId: string) => Q.Promise<ITemplateOverrideInfo>;
        getTemplatesForKit?: (kitId: string) => Q.Promise<IKitTemplatesOverrideInfo>;
        getAllTemplates?: () => Q.Promise<ITemplateOverrideInfo[]>;
    }
    export interface IPluginOverrideInfo {
        name?: string;
        version?: string;
        src?: string;
        "supported-platforms"?: string;
    }

    export interface IPlatformOverrideInfo {
        version: string;
        src?: string;
    }

    // Metadata-related interfaces
    export interface IPluginOverrideMetadata {
        [pluginId: string]: IPluginOverrideInfo;
    }

    export interface IPlatformOverrideMetadata {
        [platformName: string]: IPlatformOverrideInfo;
    }

    export interface ITemplateOverrideInfo {
        kitId: string;
        templateId?: string;
        templateInfo: ITemplateInfo;
    }

    export interface IKitTemplatesOverrideInfo {
        kitId: string;
        templates: ITemplateOverrideInfo[];
    }

    export interface ITemplateInfo {
        name: string;
        url: string;
    }

    export interface ITemplateMetadata {
        [kitId: string]: {
            [templateId: string]: ITemplateInfo;
        }
    }

    export interface IKitInfo {
        "cordova-cli": string;
        "taco-min"?: string;
        name?: string;
        description?: string;
        releaseNotesUri?: string;
        deprecated?: boolean;
        deprecatedReasonUri?: string;
        default?: boolean;
        plugins?: IPluginOverrideMetadata;
        platforms?: IPlatformOverrideMetadata;
    }

    export interface IKitMetadata {
        [kitId: string]: IKitInfo;
    }

    export interface IPluginInfo {
        name: string;
        description?: string;
        platforms?: string[];
    }

    export interface IPluginMetadata {
        [pluginId: string]: IPluginInfo;
    }

    export interface ITacoKitMetadata {
        plugins?: IPluginMetadata;
        kits: IKitMetadata;
        templates: ITemplateMetadata;
    }
    
    /**
     *   KitHelper class exports methods for parsing the kit metadata file (TacoKitMetaData.json)
     */
    export class KitHelper implements TacoKits.IKitHelper {
        private static KitMetadata: ITacoKitMetadata;
        private static DefaultKitId: string;
        private static KitFileName: string = "TacoKitMetadata.json";
        private static KitDesciptionSuffix: string = "-desc";
        private static DefaultTemplateKitOverride: string = "default";
        private static TsTemplateId: string = "typescript";

        public kitMetadataFilePath: string;
        /**
         *   Returns a promise which is either rejected with a failure to parse or find kits metadata file
         *   or resolved with the parsed metadata
         */
    
        public getKitMetadata(): Q.Promise<ITacoKitMetadata> {
            if (KitHelper.KitMetadata) {
                return Q(KitHelper.KitMetadata);
            }
            
            if (!this.kitMetadataFilePath) {
                this.kitMetadataFilePath = path.resolve(__dirname, KitHelper.KitFileName);
            }

            try {
                if (!fs.existsSync(this.kitMetadataFilePath)) {
                    return Q.reject<ITacoKitMetadata>(errorHelper.get(TacoErrorCodes.TacoKitsExceptionKitMetadataFileNotFound));
                }

                KitHelper.KitMetadata = require(this.kitMetadataFilePath);
                return Q(KitHelper.KitMetadata);
            } catch (e) {
                return Q.reject<ITacoKitMetadata>(errorHelper.get(TacoErrorCodes.TacoKitsExceptionKitMetadataFileMalformed));
            }
        }

        /**
         *   Returns a promise which is either rejected with a failure to find the specified kit
         *   or resolved with the information regarding the kit
         */
        public getKitInfo(kitId: string): Q.Promise<IKitInfo> {
            var kits: IKitMetadata = null;
            var deferred: Q.Deferred<IKitInfo> = Q.defer<IKitInfo>();
            return this.getKitMetadata().then(function (metadata: ITacoKitMetadata): Q.Promise<IKitInfo> {
                kits = metadata.kits;
                if (kitId && kits && kits[kitId]) {
                    kits[kitId].name = resources.getString(kitId);
                    kits[kitId].description = resources.getString(kitId + KitHelper.KitDesciptionSuffix);
                    deferred.resolve(kits[kitId]);
                } else {
                    // Error, empty kitId or no kit matching the kit id
                    deferred.reject(errorHelper.get(TacoErrorCodes.TacoKitsExceptionInvalidKit, kitId));
                }

                return deferred.promise;
            });
        }

        /**
         *  Returns a promise resolved with the plugin override info for the kit
         */
        public getPluginOverridesForKit(kitId: string): Q.Promise<IPluginOverrideMetadata> {
            var deferred: Q.Deferred<IPluginOverrideMetadata> = Q.defer<IPluginOverrideMetadata>();
            return this.getKitInfo(kitId).then(function (kitInfo: IKitInfo): Q.Promise<IPluginOverrideMetadata> {
                if (kitInfo.plugins) {
                    deferred.resolve(kitInfo.plugins);
                } else {
                    deferred.resolve(null);
                }

                return deferred.promise;
            });
        }

        /**
         *   Returns a promise resolved with an IKitTemplatesOverrideInfo that contains all the templates for the specified kit (or default kit if none specified)
         */
        public getTemplatesForKit(kitId: string): Q.Promise<IKitTemplatesOverrideInfo> {
            var kit: string = null;
            var templates: ITemplateMetadata = null;
            var self = this;

            return this.getTemplateMetadata()
                .then(function (templateMetadata: ITemplateMetadata): Q.Promise<string> {
                    templates = templateMetadata;

                    return kitId ? Q.resolve(kitId) : self.getDefaultKit();
                })
                .then(function (kitId: string): Q.Promise<IKitInfo> {
                    kit = kitId;

                    // Try to get the kit info of the specified kit; we won't do anything with it, but it will throw an error if the kit is invalid
                    return self.getKitInfo(kit);
                })
                .then(function (): Q.Promise<IKitTemplatesOverrideInfo> {
                    var templatesForKit: { [templateId: string]: ITemplateInfo } = null;
                    var templateList: ITemplateOverrideInfo[] = [];
                    var kitOverride: string = kit;

                    if (!templates[kitOverride]) {
                        kitOverride = KitHelper.DefaultTemplateKitOverride;
                    }

                    templatesForKit = templates[kitOverride];

                    for (var templateId in templatesForKit) {
                        if (templatesForKit.hasOwnProperty(templateId)) {
                            var templateOverrideInfo: ITemplateOverrideInfo = {
                                kitId: kitOverride,
                                templateId: templateId,
                                templateInfo: templatesForKit[templateId]
                            };

                            templateOverrideInfo.templateInfo.name = resources.getString(templateOverrideInfo.templateInfo.name);
                            templateList.push(templateOverrideInfo);
                        }
                    }

                    var kitTemplatesOverrideInfo: IKitTemplatesOverrideInfo = {
                        kitId: kitOverride,
                        templates: templateList
                    };

                    return Q.resolve(kitTemplatesOverrideInfo);
                });
        }

        /**
         *   Returns a promise resolved with an ITemplateOverrideInfo[] that contains all the available templates regardless of kits
         */
        public getAllTemplates(): Q.Promise<ITemplateOverrideInfo[]> {
            return this.getTemplateMetadata()
                .then(function (templateMetadata: ITemplateMetadata): Q.Promise<ITemplateOverrideInfo[]> {
                    var templateList: ITemplateOverrideInfo[] = [];

                    // As we are printing the union of the templates defined in all of the kit overrides, we need a dictionary of template IDs we already added to our list to avoid duplication
                    var knownTemplates: { [id: string]: boolean } = {};

                    Object.keys(templateMetadata).forEach(function (kitId: string): void {
                        Object.keys(templateMetadata[kitId]).forEach(function (templateId: string): void {
                            if (!knownTemplates[templateId]) {
                                var templateOverrideInfo: ITemplateOverrideInfo = {
                                    kitId: kitId,
                                    templateId: templateId,
                                    templateInfo: templateMetadata[kitId][templateId]
                                };

                                templateOverrideInfo.templateInfo.name = resources.getString(templateOverrideInfo.templateInfo.name);
                                templateList.push(templateOverrideInfo);
                                knownTemplates[templateId] = true;
                            }
                        });
                    });

                    return Q.resolve(templateList);
                });
        }

        /**
         *   Returns a promise resolved by the template override information for the specified kit
         *   If there is an override for {kitId} -> returns the template override info for the {templateId}
         *   Else -> returns the default template information with id {templateId}
         */
        public getTemplateOverrideInfo(kitId: string, templateId: string): Q.Promise<ITemplateOverrideInfo> {
            var deferred: Q.Deferred<ITemplateOverrideInfo> = Q.defer<ITemplateOverrideInfo>();
            var templates: ITemplateMetadata = null;
            var templateOverrideInfo: ITemplateOverrideInfo = null;
            var self = this;

            return this.getTemplateMetadata()
                .then(function (templateMetadata: ITemplateMetadata): Q.Promise<string> {
                    templates = templateMetadata;

                    return kitId ? Q.resolve(kitId) : self.getDefaultKit();
                })
                .then(function (kitId: string): Q.Promise<ITemplateOverrideInfo> {
                    if (templates[kitId]) {
                        // Found an override for the specified kit
                        if (templates[kitId][templateId]) {
                            // Found the specified template
                            templateOverrideInfo = self.createTemplateOverrideInfo(kitId, templates[kitId][templateId]);

                            // Properly assign the localized template name
                            templateOverrideInfo.templateInfo.name = resources.getString(templateOverrideInfo.templateInfo.name);

                            // Convert the url from relative to absolute local path
                            templateOverrideInfo.templateInfo.url = path.resolve(__dirname, templateOverrideInfo.templateInfo.url);
                            deferred.resolve(templateOverrideInfo);
                        } else {
                            // Error, the kit override does not define the specified template id
                            if (templateId === KitHelper.TsTemplateId) {
                                // We have a special error message for typescript
                                deferred.reject(errorHelper.get(TacoErrorCodes.TacoKitsExceptionTypescriptNotSupported));
                            } else {
                                deferred.reject(errorHelper.get(TacoErrorCodes.TacoKitsExceptionInvalidTemplate, templateId));
                            }
                        }
                    } else if (templates[KitHelper.DefaultTemplateKitOverride][templateId]) {
                        // Found a default template matching the specified template id
                        templateOverrideInfo = self.createTemplateOverrideInfo(KitHelper.DefaultTemplateKitOverride, templates[KitHelper.DefaultTemplateKitOverride][templateId]);

                        // Properly assign the localized template name
                        templateOverrideInfo.templateInfo.name = resources.getString(templateOverrideInfo.templateInfo.name);

                        // Convert the url from relative to absolute local path
                        templateOverrideInfo.templateInfo.url = path.resolve(__dirname, templateOverrideInfo.templateInfo.url);
                        deferred.resolve(templateOverrideInfo);
                    } else {
                        // Error, no template matching the specified template id
                        deferred.reject(errorHelper.get(TacoErrorCodes.TacoKitsExceptionInvalidTemplate, templateId));
                    }

                    return deferred.promise;
                });
        }

        /**
         *  Returns a promise resolved with the platform override info for the kit
         */
        public getPlatformOverridesForKit(kitId: string): Q.Promise<IPlatformOverrideMetadata> {
            var deferred: Q.Deferred<IPlatformOverrideMetadata> = Q.defer<IPlatformOverrideMetadata>();
            return this.getKitInfo(kitId).then(function (kitInfo: IKitInfo): Q.Promise<IPlatformOverrideMetadata> {
                if (kitInfo.platforms) {
                    deferred.resolve(kitInfo.platforms);
                } else {
                    deferred.resolve(null);
                }

                return deferred.promise;
            });
        }

        /**
         *   Returns a promise resolved by a valid cordova Cli for the kitId
         *   If kitId param is a valid {kitId}, returns the cordova Cli used by the kit with id {kitId}
         *   Otherwise, returns the cordovaCli used by the default kit
         */
        public getValidCordovaCli(kitId: string): Q.Promise<string> {
            var deferred: Q.Deferred<string> = Q.defer<string>();
            if (kitId) {
                return this.getCordovaCliForKit(kitId);
            } else {
                return this.getCordovaCliForDefaultKit();
            }
        }

        /**
         *  Returns a promise resolved with the Id of the default kit or rejected with error
         *  Note that the default kit is one with default attribute set to 'true'
         */
        public getDefaultKit(): Q.Promise<string> {
            var deferred: Q.Deferred<string> = Q.defer<string>();
            if (KitHelper.DefaultKitId) {
                deferred.resolve(KitHelper.DefaultKitId);
                return deferred.promise;
            } else {
                return this.getKitMetadata().then(function (metadata: ITacoKitMetadata): Q.Promise<string> {
                    var kits: IKitMetadata = metadata.kits;
                    Object.keys(kits).some(function (kitId: string): boolean {
                        // Get the kit for which the default attribute is set to true
                        if (kits[kitId].default) {
                            KitHelper.DefaultKitId = kitId;
                            deferred.resolve(kitId);
                            return true;
                        }
                    });
                    return deferred.promise;
                });
            }
        }

        /**
         *   Returns the template metadata for all the kits from the TacoKitMetadata.json file
         */
        public getTemplateMetadata(): Q.Promise<ITemplateMetadata> {
            var deferred: Q.Deferred<ITemplateMetadata> = Q.defer<ITemplateMetadata>();
            return this.getKitMetadata().then(function (metadata: ITacoKitMetadata): Q.Promise<ITemplateMetadata> {
                var templates = metadata.templates;
                if (templates) {
                    deferred.resolve(templates);
                } else {
                    // There definitely should be a templates node in the kit metadata
                    return Q.reject<ITemplateMetadata>(errorHelper.get(TacoErrorCodes.TacoKitsExceptionKitMetadataFileMalformed));
                }

                return deferred.promise;
            });
        }

        /**
         *  Returns a promise resolved with the Cordova Cli used by the default kit
         *  Note that the default kit is one with default attribute set to 'true'
         */
        public getCordovaCliForDefaultKit(): Q.Promise<string> {
            var deferred: Q.Deferred<string> = Q.defer<string>();
            var self = this;
            return this.getDefaultKit().then(function (defaultKit: string): Q.Promise<string> {
                return self.getCordovaCliForKit(defaultKit);
            });
            return deferred.promise;
        }

        /**
         *   Returns a promise which is either rejected with a failure to find the Cordova Cli
         *   attribute for the kit or resolved with the Cli attribute found in the matadata file
         */
        public getCordovaCliForKit(kitId: string): Q.Promise<string> {
            var deferred: Q.Deferred<string> = Q.defer<string>();
            return this.getKitInfo(kitId).then(function (kitInfo: IKitInfo): Q.Promise<string> {
                if (kitInfo["cordova-cli"]) {
                    deferred.resolve(kitInfo["cordova-cli"]);
                } else {
                    deferred.reject(errorHelper.get(TacoErrorCodes.TacoKitsExceptionNoCliSpecification, kitId));
                }

                return deferred.promise;
            });
        }

        /**
         * Builds an ITemplateOverrideInfo from a kit id and a ITemplateInfo. The ITemplateInfo is deep copied to make sure modifications
         * to the ITemplateOverrideInfo do not affect the provided ITemplateInfo.
         */
        private createTemplateOverrideInfo(kit: string, template: ITemplateInfo): ITemplateOverrideInfo {
            var templateOverrideInfo: ITemplateOverrideInfo = {
                kitId: kit,
                templateInfo: {
                    name: "",
                    url: ""
                }
            };

            // Deep copy the provided ITemplateInfo to the returned override object. Since we know ITemplateInfo only contains strings,
            // and are relatively small, it is safe to deep copy via JSON serialization
            templateOverrideInfo.templateInfo = JSON.parse(JSON.stringify(template));

            return templateOverrideInfo;
        }

        private getLocalizedTemplateName(templateInfo: ITemplateInfo): string {
            return resources.getString(templateInfo.name);
        }
    }

    export var kitHelper: IKitHelper = new KitHelper();

    /// <disable code="SA1301" justification="We are exporting classes" />
    export var TacoErrorCode = TacoErrorCodes;
    /// <enable code="SA1301" />
}

export = TacoKits;
