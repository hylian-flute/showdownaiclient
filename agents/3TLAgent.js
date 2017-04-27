﻿'use strict';

var Pokemon = require('../zarel/battle-engine').BattlePokemon;
var clone = require('../clone')
var BattleSide = require('../zarel/battle-engine').BattleSide;

// Sometimes you want to simulate things in the game that are more complicated than just damage.  For these things, we can advance our fun little forward model.
// This agent shows a way to advance the forward model.
class MultiTLAgent {
    constructor() { }

    cloneBattle(state) {
        var nBattle = clone(state);
        nBattle.p1.getChoice = BattleSide.getChoice.bind(nBattle.p1);
        nBattle.p2.getChoice = BattleSide.getChoice.bind(nBattle.p2);
        nBattle.p1.clearChoice();
        nBattle.p2.clearChoice();
        return nBattle;
    }

    getOptions(state, player) {
        if (typeof (player) == 'string' && player.startsWith('p')) {
            player = parseInt(player.substring(1)) - 1;
        }
        let activeData = state.sides[player].active.map(pokemon => pokemon && pokemon.getRequestData());
        var p1request = { active: activeData, side: state.sides[player].getData(), rqid: state.rqid };
        return this.parseRequestData(p1request);
    }

    fetch_random_key(obj) {
        var temp_key, keys = [];
        for (temp_key in obj) {
            if (obj.hasOwnProperty(temp_key)) {
                keys.push(temp_key);
            }
        }
        return keys[Math.floor(Math.random() * keys.length)];
    }



    parseRequestData(requestData) {
        if (typeof (requestData) == 'string') { requestData = JSON.parse(request); }
        var cTurnOptions = {};
        if (requestData['active']) {
            for (var i = 0; i < requestData['active'][0]['moves'].length; i++) {
                if (requestData['active'][0]['moves'][i]['disabled'] == false && requestData['active'][0]['moves'][i].pp > 0) {
                    cTurnOptions['move ' + requestData['active'][0]['moves'][i].id] = requestData['active'][0]['moves'][i];
                }
            }
        }
        if (requestData['side'] && !(requestData['active'] && requestData['active'][0]['trapped'])) {
            // Basically, if we switch to zoroark, the request data will reflect it, but the switch event data will not.
            // Therefore, if a switch event happens on this turn, we override the swapped pokemon with zoroark
            for (var i = 1; i < requestData['side']['pokemon'].length; i++) {
                if (requestData['side']['pokemon'][i].condition.indexOf('fnt') == -1) {
                    cTurnOptions['switch ' + (i + 1)] = requestData['side']['pokemon'][i];
                }
            }
        }
        for (var option in cTurnOptions) {
            cTurnOptions[option].choice = option;
        }
        return cTurnOptions;
    }

    teachSplash(pokemon) {
        var move = {
            num: 150,
            accuracy: true,
            basePower: 0,
            category: "Status",
            desc: "Nothing happens...",
            shortDesc: "Does nothing (but we still love it).",
            id: "splash",
            name: "Splash",
            pp: 40,
            priority: 0,
            flags: { gravity: 1 },
            onTryHit: function (target, source) {
                this.add('-nothing');
                return null;
            },
            secondary: false,
            target: "self",
            type: "Normal",
            contestType: "Cute",
        };
        if (move.id && pokemon.moves.indexOf(move) == -1) {
            pokemon.moves.push('splash');
            var nMove = {
                move: move.name,
                id: move.id,
                pp: (move.noPPBoosts ? move.pp : move.pp * 8 / 5),
                maxpp: (move.noPPBoosts ? move.pp : move.pp * 8 / 5),
                target: move.target,
                disabled: false,
                disabledSource: '',
                used: false,
            };
            pokemon.baseMoveset.push(nMove);
            pokemon.moveset.push(nMove);
        }
    }

    decide(gameState, options, mySide) {
        // It is important to start by making a deep copy of gameState.  We want to avoid accidentally modifying the gamestate.
        var nstate = this.cloneBattle(gameState);
        nstate.me = mySide.n;
        //console.log(gameState.sides[0].clearChoice);
        //console.log(nstate.sides[0].clearChoice);
        // The receive function is going to need access to this variable, so it makes sense to set it as a class member.
        this.mySID = mySide.n;
        this.mySide = mySide.id;
        var choices = Object.keys(options);

        function battleSend(type, data) {
            if (this.sides[1 - this.me].active[0].hp == 0 || this.sides[1 - this.me].currentRequest != 'move') {
                this.isTerminal = true;
            }
        }
        
        nstate.send = battleSend;
        nstate.start();
        // The pokemon equivalent of pass is a move called splash.  It is wonderful.
        this.teachSplash(nstate.sides[1 - this.mySID].active[0]);
        var states = [];
        // Next we simulate the outcome of all our possible actions, while assuming our opponent does nothing each turn (uses splash, but it's kind of the same thing).
        // The gamestate receives choice data as an array with 4 items
        // battle id (we can ignore this), type (we use 'choose' to indicate a choice is made), player (formatted as p1 or p2), choice
        for (var choice in options) {
            var cstate = this.cloneBattle(nstate);
            cstate.isTerminal = false;
            cstate.baseMove = choice;
            cstate.receive(['', 'choose', 'p' + (1 - this.mySID + 1), 'move splash']);
            cstate.receive(['', 'choose', 'p' + (this.mySID + 1), choice]);
            // A variable to track if the state is an end state (an end state here is defined as an event wherein the opponent is forced to switch).
            if (cstate.isTerminal) {
                return cstate.baseMove;
            }
            states.push(cstate);
        }

        // console.log(nothing);
        
        var i = 0;
        
        //console.log(gameState);
        
        while (i < 200) {
            var cState = states.shift();
            if (!cState) {
                console.log('FAILURE!');
                return this.fetch_random_key(options);
            }
            var myTurnOptions = this.getOptions(cState, mySide.id);
            for (var choice in myTurnOptions) {
                if (choice.startsWith('move')) {
                    var nstate = this.cloneBattle(cState);
                    nstate.receive(['', 'choose', 'p' + (1 - this.mySID + 1), 'move splash']);
                    nstate.receive(['', 'choose', 'p' + (this.mySID + 1), choice]);
                    if (nstate.isTerminal) {
                        return nstate.baseMove;
                    }
                    states.push(nstate);
                }
            }
            i++;
            
        }
        console.log('oops I timed out!');
        return this.fetch_random_key(options);
    }

    assumePokemon(pname, plevel, pgender, side) {
        var nSet = {
            species: pname,
            name: pname,
            level: plevel,
            gender: pgender,
            evs: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 0 },
            ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
            nature: "Hardy"
        };
        var basePokemon = new Pokemon(nSet, side);
        // If the species only has one ability, then the pokemon's ability can only have the one ability.
        // Barring zoroark, skill swap, and role play nonsense.
        // This will be pretty much how we digest abilities as well
        if (Object.keys(basePokemon.template.abilities).length == 1) {
            basePokemon.baseAbility = toId(basePokemon.template.abilities['0']);
            basePokemon.ability = basePokemon.baseAbility;
            basePokemon.abilityData = { id: basePokemon.ability };
        }
        return basePokemon;
    }

    digest(line) {
    }
}

exports.Agent = MultiTLAgent;