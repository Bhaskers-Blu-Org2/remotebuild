﻿/**
﻿ *******************************************************
﻿ *                                                     *
﻿ *   Copyright (C) Microsoft. All rights reserved.     *
﻿ *                                                     *
﻿ *******************************************************
﻿ */

/// <reference path="../../typings/tacoUtils.d.ts" />
/// <reference path="../../typings/node.d.ts" />
/// <reference path="../../typings/helpCommandBase.d.ts" />

"use strict";

import path = require ("path");

import tacoUtility = require ("taco-utils");
import HelpCommandBase = tacoUtility.HelpCommandBase;

/*
 * Help handles "Taco Help"
 */
class Help extends HelpCommandBase {
    private static TACO_STRING: string = "taco-remote";
    constructor() {
        super(Help.TACO_STRING, path.join(__dirname, "./commands.json"), require("../resources/resourceManager"));
    }
}

export = Help;
