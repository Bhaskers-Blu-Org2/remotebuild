﻿/**
﻿ *******************************************************
﻿ *                                                     *
﻿ *   Copyright (C) Microsoft. All rights reserved.     *
﻿ *                                                     *
﻿ *******************************************************
﻿ */

/// <reference path="../typings/node.d.ts" />
/// <reference path="../typings/colors.d.ts" />

import fs = require ("fs");
import path = require ("path");
import colors = require ("colors");

module TacoUtility {
    export class Logger {
        /**
         * returns colorized string
         * wrapping "colors" module because not yet possible to combine themes, i.e. ["yellow", "bold"]:  https://github.com/Marak/colors.js/issues/72
         */
        public static colorize(msg: string, level: Logger.Level): string {
            colors.setTheme({
                error: "red",
                warn: "yellow",
                link: "cyan",
                normalBold: "bold",
                success: "green"
            });

            switch (level) {
                case Logger.Level.Error: return msg.error.bold;
                case Logger.Level.Warn: return msg.warn.bold;
                case Logger.Level.Link: return msg.link.underline;
                case Logger.Level.Normal: return msg;
                case Logger.Level.NormalBold: return msg.normalBold;
                case Logger.Level.Success: return msg.success.bold;
            }
        }          

        /**
         * log
         */
        public static log(msg: string, level: Logger.Level = Logger.Level.Normal): void {
            if (!msg) {
                return;
            }

            msg = Logger.colorize(msg, level);
            switch (level) {
                case Logger.Level.Error:
                case Logger.Level.Warn:
                    process.stderr.write(msg);
                    return;

                case Logger.Level.Link:
                case Logger.Level.Success:
                case Logger.Level.Normal:
                case Logger.Level.NormalBold:
                    process.stdout.write(msg);
                    break;
            }
        }
        
        /**
         * for quick logging use
         */
        public static logLine(msg: string, level: Logger.Level = Logger.Level.Normal): void {
            Logger.log(msg + "\n", level);
        }

        public static logErrorLine(msg: string): void {
            Logger.logLine(msg, Logger.Level.Error);
        }

        public static logWarnLine(msg: string): void {
            Logger.logLine(msg, Logger.Level.Warn);
        }

        public static logLinkLine(msg: string): void {
            Logger.logLine(msg, Logger.Level.Link);
        }

        public static logNormalLine(msg: string): void {
            Logger.logLine(msg, Logger.Level.Normal);
        }

        public static logNormalBoldLine(msg: string): void {
            Logger.logLine(msg, Logger.Level.NormalBold);
        }

        public static logSuccessLine(msg: string): void {
            Logger.logLine(msg, Logger.Level.Success);
        }

        public static logIndentedString(msg: string, num: number, indent: Logger.Indent = Logger.Indent.Left, level: Logger.Level = Logger.Level.Normal): void {
            var sequence: string = "";
            if (indent === Logger.Indent.Left) {
                sequence = Array(num + 1).join(" ") + msg;
            } else {
                sequence = msg + Array(num + 1).join(" ");
            }

            Logger.log(sequence, level);
        }

        public static logRepeatedString(msg: string, num: number, level: Logger.Level = Logger.Level.Normal): void {
            var sequence: string = Array(num + 1).join(msg);
            Logger.log(sequence, level);
        }
    };

    export module Logger {
        /**
         * Warning levels
         */
        export enum Level { Warn, Error, Link, Normal, Success, NormalBold };
        export enum Indent { Left, Right };
    }
}

export = TacoUtility;
