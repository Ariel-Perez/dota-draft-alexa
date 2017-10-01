'use strict';
var Alexa = require('alexa-sdk');
var APP_ID = undefined;  // can be replaced with your app ID if publishing
var suggest = require('./suggest');

var APP_ID_TEST = "mochatest";  // used for mocha tests to prevent warning
// end Test hooks
/*
    TODO (Part 2) add messages needed for the additional intent
    TODO (Part 3) add reprompt messages as needed
*/
var languageStrings = {
    "en": {
        "translation": {
            "START": "Starting a new Draft for ",
            "GAME_MODE": "Game Mode",
            "PICK_SUGGESTION": "You could pick ",
            "BAN_SUGGESTION": "You should ban ",
            "REQUEST_GAME_MODE": "What game mode are you playing?",
            "ASK_FIRST_PICK": "Do you have first pick?",
            "SKILL_NAME": "DOTA Draft",  // OPTIONAL change this to a more descriptive name
            "HELP_MESSAGE": "You can start a draft, or exit... What can I help you with?",
            "HELP_REPROMPT": "What can I help you with?",
            "STOP_MESSAGE": "Good luck, have fun!",
            "WELCOME": "Welcome to the DOTA Draft skill. Would you like to start a draft?"
        }
    }
};

var states = {
    IDLE: "_IDLE",      // User is not drafting
    SETUP: "_SETUP",    // Choosing game mode
    PICKING: "_PICKING" // User is in picking phase
};

var game_modes = {
    CM: "captain's mode",
    AP: "all pick"
}

var suggestion_type = {
    PICK: "pick",
    BAN: "ban"
}

exports.handler = function (event, context, callback) {
    var alexa = Alexa.handler(event, context);
    alexa.APP_ID = APP_ID;
    // set a test appId if running the mocha local tests
    if (event.session.application.applicationId == "mochatest") {
        alexa.appId = APP_ID_TEST
    }
    // To enable string internationalization (i18n) features, set a resources object.
    alexa.resources = languageStrings;
    alexa.registerHandlers(handlers, idleStateHandler, setupStateHandler, pickingStateHandler);
    alexa.execute();
};

const idleStateHandler = Alexa.CreateStateHandler(states.IDLE, {
    'AMAZON.YesIntent': function () {
        this.emitWithState("StartIntent");
    },
    'StartIntent': function() {
        var intent = this.event.request.intent;
        var mode = intent.slots.mode;
        if (!mode.value) {
            this.emit(":elicitSlot", "mode", this.t("REQUEST_GAME_MODE"), this.t("GAME_MODE"));
        }
        // Save game mode for use during picking phase
        this.attributes.game_mode = mode.value;
        this.attributes.player_picks = [];
        this.attributes.player_bans = [];
        this.attributes.enemy_picks = [];
        this.attributes.enemy_bans = [];
        this.attributes.rejected_picks = [];
        this.attributes.rejected_bans = [];
        if (mode.value == game_modes.CM) {
            this.handler.state = states.SETUP;
            this.emit(":ask", this.t("ASK_FIRST_PICK"), this.t("SKILL_NAME"));
        } else {
            this.handler.state = states.PICKING;
            this.emit(":tell", this.t("START") + mode.value, this.t("SKILL_NAME"));
        }
    }
});

const setupStateHandler = Alexa.CreateStateHandler(states.SETUP, {
    'AMAZON.YesIntent': function() {
        this.attributes.first_pick = true;
        this.handler.state = states.PICKING;
        this.emitWithState("SuggestBanIntent");
    },
    'AMAZON.NoIntent': function() {
        this.attributes.first_pick = false;
        this.handler.state = states.PICKING;
        this.emitWithState("SuggestBanIntent");
    }
});

const pickingStateHandler = Alexa.CreateStateHandler(states.PICKING, {
    'SuggestPickIntent': function() {
        var suggestion = suggest.pick(
            this.attributes.player_picks,
            this.attributes.enemy_picks,
            this.attributes.rejected_picks.concat(
                this.attributes.player_bans).concat(
                this.attributes.enemy_bans)
        );

        this.attributes.suggestion_type = suggestion_type.PICK;
        this.attributes.last_suggestion = suggestion;

        this.emit(":ask", this.t("PICK_SUGGESTION") + suggestion, this.t("SKILL_NAME"));
    },
    'SuggestBanIntent': function() {
        var suggestion = suggest.ban(
            this.attributes.player_picks,
            this.attributes.enemy_picks,
            this.attributes.rejected_picks.concat(
                this.attributes.player_bans).concat(
                this.attributes.enemy_bans)
        );

        this.attributes.suggestion_type = suggestion_type.BAN;
        this.attributes.last_suggestion = suggestion;

        this.emit(":ask", this.t("BAN_SUGGESTION") + suggestion, this.t("SKILL_NAME"));
    },

    'AMAZON.YesIntent': function() {
        var nextIntent = "PlayerPickIntent";
        if (this.attributes.suggestion_type == suggestion_type.PICK) {
            this.attributes.player_picks.push(this.attributes.last_suggestion);
        } else {
            this.attributes.player_bans.push(this.attributes.last_suggestion);
        }
        this.emit(":tell", "Great!");
    },
    'AMAZON.NoIntent': function() {
        var nextIntent = "SuggestPickIntent";
        if (this.attributes.suggestion_type == suggestion_type.PICK) {
            this.attributes.rejected_picks.push(this.attributes.last_suggestion);
        } else {
            nextIntent = "SuggestBanIntent";
            this.attributes.rejected_bans.push(this.attributes.last_suggestion);
        }
        this.emitWithState("SuggestBanIntent");
    },
    'EnemyPickIntent': function() {
        var intent = this.event.request.intent;
        var hero = intent.slots.hero.value;
        this.attributes.enemy_picks.push(hero);
        this.emit(":tell", "Oh no! " + hero + " is a good pick for them.");
    },
    'EnemyBanIntent': function() {
        var intent = this.event.request.intent;
        var hero = intent.slots.hero.value;
        this.attributes.enemy_bans.push(hero);
        this.emit(":tell", "Curses! " + hero + " was a good pick.");
    },
    'PlayerPickIntent': function() {
        var intent = this.event.request.intent;
        var hero = intent.slots.hero.value;
        this.attributes.player_picks.push(hero);
        this.emit(":tell", "Good job, " + hero + " is a good pick.");
    },
    'PlayerBanIntent': function() {
        var intent = this.event.request.intent;
        var hero = intent.slots.hero.value;
        this.attributes.player_bans.push(hero);
        this.emit(":tell", "Well done, " + hero + " was a good pick for them.");
    }
});


var handlers = {
     // This will short-cut any incoming intent or launch requests and route them to this handler.
    'NewSession': function() {
        this.handler.state = states.IDLE;
        this.emit(":ask", this.t("WELCOME"),
            this.t("SKILL_NAME"));
    },
    'LaunchRequest': function () {
        this.emit("StartIntent");
    },
    'AMAZON.HelpIntent': function () {
        var speechOutput = this.t("HELP_MESSAGE");
        var reprompt = this.t("HELP_MESSAGE");
        this.emit(":ask", speechOutput, reprompt);
    },
    'AMAZON.CancelIntent': function () {
        this.emit(":tell", this.t("STOP_MESSAGE"));
    },
    'AMAZON.StopIntent': function () {
        this.emit(":tell", this.t("STOP_MESSAGE"));
    }
};

function randomPhrase(phraseArr) {
    // returns a random phrase
    // where phraseArr is an array of string phrases
    var i = 0;
    i = Math.floor(Math.random() * phraseArr.length);
    return (phraseArr[i]);
};
