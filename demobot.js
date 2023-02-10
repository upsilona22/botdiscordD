const Discord = require("discord.js");
const client = new Discord.Client({ intents: ['GUILDS', 'GUILD_MESSAGES'] });
//const config = require("./config.json"); // For local Testing only
const config = process.env; // for heroku usage
client.once('ready', () => {
    console.log('Félicitations, votre bot Discord a été correctement initialisé !');
 });

// hold jsons
let leaderboard;
let highscores;


// holds discord IDs of authorized moderators
//const mods = require("./moderators.json");
const modRoleID = '783016924475949116';

const fetch = require('isomorphic-fetch');
const Dropbox = require('dropbox').Dropbox;
let dbx = new Dropbox({accessToken: config.dropToken, fetch: fetch});
let failedDownload = false;

// On startup downloads files from Dropbox to keep continuity across sessions
client.on("ready", () => {
    download();
});

// Logs into Discord
client.login(config.discordToken).catch(function (err) {
    console.log(err);
});

// when the bot sees a message, begins running leaderboard update
client.on("messageCreate", async message => {
    if (!client.application?.owner) await client.application?.fetch();

    // Ignores messages from bots to stop abuse
    if (message.author.bot) return;

    let author = message.author.id;

    if (message.content.toLowerCase() === 'd: deploy' && author === client.application?.owner.id) {
        const update = {
            name: 'update',
            description: 'Mise à jour de votre score sur le classement',
            options: [
                {
                    name: 'demolitions',
                    type: 'INTEGER',
                    description: 'Le nombre de démolitions que tu as',
                    required: true,
                },
                {
                    name: 'exterminations',
                    type: 'INTEGER',
                    description: 'Le nombre d\'extermination que tu as',
                    required: true,
                },
                {
                    name: 'name',
                    type: 'STRING',
                    description: 'Votre nom est affiché sur le classement. Facultatif après la première utilisation ',
                    required: false,
                }
            ],
        };

        const updateCommand = await client.guilds.cache.get('783010920745926656')?.commands.create(update);

        const authorize = {
            name: 'authorize',
            description: '(modo seulement) Change le niveau du score utilisateur',
            options: [
                {
                    name: 'user',
                    type: 'USER',
                    description: 'Utilisateur autorisé',
                    required: true,
                },
                {
                    name: 'level',
                    type: 'INTEGER',
                    description: 'Quel niveau dautorisation?',
                    required: true,
                    choices: [
                        {
                            name: 'None',
                            value: 0,
                        },
                        {
                            name: '15k+ demolitions et / ou 500+ exterminations',
                            value: 1,
                        },
                        {
                            name: 'Meilleur score au classement',
                            value: 2,
                        },
                    ],
                }
            ],
        };

        const authorizeCommand = await client.guilds.cache.get('783010920745926656')?.commands.create(authorize);

        const name = {
            name: 'name',
            description: '(modos seulement) Change  ajoute le nom d\' utilisateur au classement',
            options: [
                {
                    name: 'user',
                    type: 'USER',
                    description: 'Utilisteur autorisé',
                    required: true,
                },
                {
                    name: 'name',
                    type: 'STRING',
                    description: 'Nouveau nom pour l\'utilisateur',
                    required: true,
                }
            ],
        };

        const nameCommand = await client.guilds.cache.get('783010920745926656')?.commands.create(name);

        const country = {
            name: 'country',
            description: 'Définissez votre pays pour qu\'il apparaisse dans le classement',
            options: [
                {
                    name: 'country',
                    type: 'STRING',
                    description: 'Nouveau pays affiché',
                    required: true,
                }
            ],
        };

        const countryCommand = await client.guilds.cache.get('783010920745926656')?.commands.create(country);

        const override = {
            name: 'override',
            description: '(modos seulement) Modifier le score du classement d\'un utilisateur',
            options: [
                {
                    name: 'user',
                    type: 'USER',
                    description: 'utilisateur modifié',
                    required: true,
                },
                {
                    name: 'demolitions',
                    type: 'INTEGER',
                    description: 'Le nombre de démolitions à changer',
                    required: true,
                },
                {
                    name: 'exterminations',
                    type: 'INTEGER',
                    description: 'Le nombre d\'exterminations à changer',
                    required: true,
                }
            ],
        };

        const overrideCommand = await client.guilds.cache.get('783010920745926656')?.commands.create(override);

        const remove = {
            name: 'remove',
            description: '(modos seulement) suppprime l\'utilisateur du classement',
            options: [
                {
                    name: 'user',
                    type: 'USER',
                    description: 'Utilisateur à supprimer (peut être un identifiant Discord pour les utilisateurs bannis)',
                    required: true,
                }
            ],
        };

        const removeCommand = await client.guilds.cache.get('783010920745926656')?.commands.create(remove);

        const setUserCountry = {
            name: 'setusercountry',
            description: '(modos seulement) Définit le pays d\'un utilisateur',
            options: [
                {
                    name: 'user',
                    type: 'USER',
                    description: 'Utilisateur à changer (peut être un identifiant Discord pour les utilisateurs bannis)',
                    required: true,
                },
                {
                    name: 'country',
                    type: 'STRING',
                    description: 'Nouveau pays',
                    required: true,
                }
            ],
        };

        const setUserCountryCommand = await client.guilds.cache.get('783010920745926656')?.commands.create(setUserCountry);

        console.log("Deployed slash commands");
        message.react("✅");
        return;
    }

    // Ensures the message starts with the prefix "D:"
    if (message.content.toUpperCase().indexOf(config.prefix) !== 0) return;

    // If the previous download failed, tries again
    if (failedDownload) {
        download();
    }

    // If two in a row have failed, gives up and warns user
    // Prevents overwriting of data with old data
    if (failedDownload) {
        await message.reply("Failed to connect to dropbox. Try again in a couple minutes");
        return;
    }

    // Command for me to change a user's history
    if (message.content.toLowerCase().indexOf('d: h') == 0 && author === client.application?.owner.id) {
        addHistory(message);
        return;
    }

    // Asks new users to use /update which handles new users
    if (!leaderboard[author]) {
        await message.reply("Les nouveaux comptes doivent configurer leur nom en utilisant /update");
        return;
    }

    ////////////
    // Now checks scores for legacy D: E: users
    // Probably removing eventually, but not at the momeny

    // Checks for demo and exterms formatted as
    // D: # E: #
    const regexVal = /[dD]:\s*(\d+)\s+[eE]:\s*(\d+)/;

    // regex ensures proper command usage
    let matchResults = message.content.match(regexVal);

    if (!matchResults) {
        message.reply("Format invalide, veuillez mettre à jour vos statistiques avec /update");
        return;
    }

    let demos = parseInt(matchResults[1]);
    let exterms = parseInt(matchResults[2]);

    addScores(demos, exterms, author, message);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    // if the previous download failed, tries again
    if (failedDownload) {
        download();
    }

    // if two in a row have failed, gives up and warns user
    // Prevents overwriting of data with old data
    if (failedDownload) {
        await interaction.reply("Failed to connect to dropbox. Try again in a couple minutes");
        return;
    }

    if (interaction.commandName === 'update') { 
        const demos = interaction.options.get('demolitions').value;
        const exterms = interaction.options.get('exterminations').value;
        let name = interaction.options.get('name')?.value;

        let author = interaction.user.id;

        // if there is a name supplied
        if (name) {
            // If the leaderboard doesn't include the author, adds them
            // otherwise ignores name field
            if (!leaderboard[author]) {
                leaderboard[author] = {
                    "Name": name,
                    "Demolitions": 0,
                    "Exterminations": 0,
                    "LastUpdate": "2015-07-07T00:00:00.000",
                    "Authorized": 0,
                    "History": []
                  };
            }

            leaderboard[author].Name = name;
        } else {
            // if the leaderboard doesn't include this discord ID and no name was given, returns and warns user
            if (!leaderboard[author]) {
                await interaction.reply("Le nouveau compte n'a pas de nom, réessayez en incluant un nom");
                return;
            }
        }

        addScores(demos, exterms, author, interaction);
    }

    if (interaction.commandName === 'authorize') {
        // Allows moderators to authorize users to post their scores
        // Unauthorized users cannot upload scores >15000 demos and/or 500 exterms
        const user = interaction.options.get('user').value;
        const level = interaction.options.get('level').value;

        if (!interaction.member.roles.cache.has(modRoleID)) {
            await interaction.reply({content: "Uniquement un modérateur peut utiliser cette commande", ephemeral: true});
            return;
        }

        // if the leaderboard doesn't include this discord ID, returns and warns user
        if (!leaderboard[user]) {
            await interaction.reply({content:"<@" + user + 
                "> n'est pas dans le classement. Demandez-leur d'utiliser /update", ephemeral: true});
            return;
        }

        authorize(user, level, interaction);
    }

    if (interaction.commandName === 'name') {
        // Allows moderators to rename users
        const user = interaction.options.get('user').value;
        const name = interaction.options.get('name').value;

        if (!interaction.member.roles.cache.has(modRoleID)) {
            await interaction.reply({content: "Uniquement les modos peuvent utiliser cette commande", ephemeral: true});
            return;
        }

        nameUser(name, user, interaction);
    }

    if (interaction.commandName === 'country') {
        const country = interaction.options.get('country').value;
        let author = interaction.user.id;

        // If the user isn't in the leaderboard, warns user
        if (!leaderboard[author]) {
            message.reply("<@" + author + "> n'est pas dans le classement");
            return;
        }

        // Links ID to country
        leaderboard[author].Country = country;

        // Uploads the updated JSON Leaderboard
        uploadJSON(interaction);
        interaction.reply("Set <@" + author + ">'s country to " + country);
    }

    if (interaction.commandName === 'override') {
        // Allows moderators to rename users
        const user = interaction.options.get('user').value;
        const demos = interaction.options.get('demolitions').value;
        const exterms = interaction.options.get('exterminations').value;

        if (!interaction.member.roles.cache.has(modRoleID)) {
            await interaction.reply({content: "Uniquement les modos peuvent utiliser cette commande", ephemeral: true});
            return;
        }

        if (!leaderboard[user]) {
            interaction.reply("<@" + user + "> n'est pas dans le classement");
            return;
        }

        leaderboard[user].Demolitions = demos;
        leaderboard[user].Exterminations = exterms;
        uploadJSON(interaction);
        interaction.reply("<@" + user + "> a " + demos + " demos et " + exterms + " exterminations");
    }

    if (interaction.commandName === 'remove') {
        // Allows moderators to rename users
        const user = interaction.options.get('user').value;

        if (!interaction.member.roles.cache.has(modRoleID)) {
            await interaction.reply({content: "Uniquement les modos peuvent utiliser cette commande", ephemeral: true});
            return;
        }

        if (!leaderboard[user]) {
            interaction.reply("<@" + user + "> Uniquement les modos peuvent utiliser cette commande");
            return;
        }

        delete leaderboard[user];
        uploadJSON(interaction);
        interaction.reply("<@" + user + "> a été retiré du classement");
    }

    if (interaction.commandName === 'setusercountry') {
        // Allows moderators to rename users
        const user = interaction.options.get('user').value;
        const country = interaction.options.get('country').value;

        if (!interaction.member.roles.cache.has(modRoleID)) {
            await interaction.reply({content: "Uniquement les modos peuvent utiliser cette commande", ephemeral: true});
            return;
        }

        if (!leaderboard[user]) {
            interaction.reply("<@" + user + "> n'est pas dans le classement");
            return;
        }

        leaderboard[user].Country = country;
        uploadJSON(interaction);
        interaction.reply("Set <@" + user + ">'s country to " + country);
    }
});

function authorize(id, level, message) {
    // If the user isn't in the leaderboard, adds them
    if (!leaderboard[id]) {
        console.log("Erreur lors de la mise à jour de l'utilisateur non valide " + id);
        return;
    }

    leaderboard[id].Authorized = level;

    // Uploads the updated JSON Leaderboard
    uploadJSON(message);
    message.reply("Authorized " + leaderboard[id].Name + " at level " + level);
    console.log("Authorized " + leaderboard[id].Name + " at level " + level);
}

function nameUser(name, id, message) {
    // If the user isn't in the leaderboard, warns user
    if (!leaderboard[id]) {
        message.reply("<@" + id + "> n'est pas dans le classement");
        return;
    }

    // Links ID to name
    leaderboard[id].Name = name;

    // Uploads the updated JSON Leaderboard
    uploadJSON(message);
    message.reply("Renamed <@" + id + "> to " + name);
}

async function addScores(demos, exterms, id, interaction) {
    let authorized = leaderboard[id].Authorized;

    // Only authorized users can upload scores with >15000 demos and/or >500 exterms
    // Needs permission to do so
    if (authorized === 0) {
        if (demos > 15000) {
            await interaction.reply("Félicitations, vous avez plus de 15 000 démolitions ! Les nouvelles soumissions avec des scores élevés nécessitent un examen manuel par un administrateur. Veuillez envoyer une capture d'écran de vos statistiques à cette chaîne. Si vous avez des questions, veuillez les poser ici");
            return;
        }

        if (exterms > 500) {
            await interaction.reply("Félicitations, vous avez plus de 15 000 exterminations ! Les nouvelles soumissions avec des scores élevés nécessitent un examen manuel par un administrateur. Veuillez envoyer une capture d'écran de vos statistiques à cette chaîne. Si vous avez des questions, veuillez les poser ici");
            return;
        }
    }

    if (authorized === 1) {
        // Checks against the top score
        // Only users authorized level 2 can update the top score
        // Prevents abuse by authorized 1 users
        if (demos >= highscores.leaderDemos) {
            await interaction.reply("Félicitations pour la première place pour les démos ! " +
                "Veuillez envoyer une preuve de statistiques ici avant que nous puissions vérifier votre place.");
            return;
        }
        if (exterms >= highscores.leaderExterm) {
            await interaction.reply("Félicitations pour la première place des Exterminations! " +
                "Veuillez envoyer une preuve de statistiques ici avant que nous puissions vérifier votre place.");
            return;
        }
    }

    if (exterms * 7 > demos) {
        await interaction.reply("Assurez-vous que vos exterminations sont 7 fois moins nombreuses que vos démos");
        return;
    }

    // If user is authorized 2 (highest level), checks if the top score should be updated
    if (authorized === 2) {
        let newScore = false; 
        if (demos > highscores.leaderDemos) {
            newScore = true;
            highscores.leaderDemos = demos;
        }

        if (exterms > highscores.leaderExterm) {
            newScore = true;
            highscores.leaderExterm = demos;
        }

        if (newScore) {
            uploadHighScores();
        }
    }

    // Checks for server role and nickname milestones
    checkMilestones(demos, exterms, id, interaction);

    // Adds score
    leaderboard[id].Demolitions = demos;
    leaderboard[id].Exterminations = exterms;
    let currTime = new Date();
    let currTimeString = currTime.toISOString();
    leaderboard[id].LastUpdate = currTimeString;
    leaderboard[id].History.push({
        "Demolitions": demos,
        "Exterminations": exterms,
        "Time": currTimeString
    });

    uploadJSON(interaction);
    await interaction.reply("<@" + id + "> a " + demos + " demos et " + exterms + " exterminations\n" +
        "Regarde ici le classement = https://classementdemolitionsfrancophone.netlify.app");
}

// Checks if the player's passed a milestone for review
// As this is informal, still lets the score go through
function checkMilestones(demos, exterms, id, interaction) {
    
    let currentBombs = Math.floor(leaderboard[id].Demolitions / 10000);
    let newBombs = Math.floor(demos / 10000);
    if (currentBombs < newBombs) {
        interaction.channel.send("Félicitations pour la récompense de niveau " + newBombs + " en demolitions <@" + id + 
            ">! Veuillez fournir une capture d'écran de vos statistiques. Les récompenses sont expliquées ici <#1073253802934808668>");
        // Returns early as it's already asking for a screenshot. Doesn't need request for exterms
        return;
    }

    let currentExterms = leaderboard[id].Exterminations;

    let reachedMilestone = false;
    // all current milestones available. Descending order to congratulate on 
    let milestones = [10000, 5000, 1000, 100];
    for (let i in milestones) {
        milestone = milestones[i];
        reachedMilestone = extermMilestone(currentExterms, exterms, milestone, id, interaction);
        // only ask user for highest new milestone
        if (reachedMilestone) {
            break;
        }
    }
}

// checks if a player just reached a new milestone for exterminations
// Uses function as I assume more will be added over time
function extermMilestone(oldExterms, newExterms, milestone, id, interaction) {
    // ignore milestone if the player's already reached it
    if (oldExterms >= milestone) {
        return false;
    }

    // New milestone reached!
    if (newExterms >= milestone) {
        interaction.channel.send("Felicitations pour vos " + milestone + "+ exterminations <@" + id + 
            ">! Veuillez fournir une capture d'écran de vos statistiques. Les récompenses sont expliquées ici <#1073253802934808668>");
        return true;
    }

    return false;
}

// used to upload and override player's history from discord without manual file editing
async function addHistory(message) {
    let attachments = (message.attachments);
    let attachmentURL;
    if (attachments && attachments.at(0)){
        attachmentURL = attachments.at(0).url;
    } else {
        message.reply("Bad attachments!")
        return;
    }

    let playerID;
    if (message.mentions.users && message.mentions.users.at(0)) {
        playerID = message.mentions.users.at(0).id
    } else {
        message.reply("Bad mention!")
        return;
    }

    console.log( attachmentURL );
    console.log( playerID );

    let attachmentRequest = await fetch(attachmentURL);

    let attachmentJSON = await attachmentRequest.json();

    leaderboard[playerID].History = attachmentJSON;

    uploadJSON(message);
    message.reply("Set history for <@" + playerID + "> AKA " + leaderboard[playerID].Name);
}

///////////////////////////////////////////
///////// Dropbox API interactions ////////
///////////////////////////////////////////

// downloads files from Dropbox to ensure continuity over multiple sessions
function download() {
    failedDownload = false;

    // Downloads and saves dropbox files of leaderboards
    // Allows cross-session saving of data and cloud access from other apps
    dbx.filesDownload({path: "/leaderboard.json"})
        .then(function (data) {
            leaderboard = JSON.parse(data.fileBinary);
            console.log("Downloaded leaderboard.json");
        })
        .catch(function (err) {
            failedDownload = true;
            throw err;
        });

    dbx.filesDownload({path: "/highscores.json"})
        .then(function (data) {
            highscores = JSON.parse(data.fileBinary);
            console.log("Downloaded highscores.json");
        })
        .catch(function (err) {
            failedDownload = true;
            throw err;
        });

    if (failedDownload) {
        console.log("failed download");
    }
}

// uploads the JSON file leaderboard to Dropbox
function uploadJSON(message) {
    dbx.filesUpload({path: '/leaderboard.json', contents: JSON.stringify(leaderboard, null, "\t"), mode: "overwrite"})
        .catch(function (error) {
            message.reply("Dropbox error for JSON Leaderboard. Try same command again");
            console.error(error);
        });

    console.log("Uploaded leaderboard JSON");
}

// uploads the JSON file high scores to Dropbox
function uploadHighScores(message) {
    dbx.filesUpload({path: '/highscores.json', contents: JSON.stringify(highscores, null, "\t"), mode: "overwrite"})
        .catch(function (error) {
            message.reply("Dropbox error for highscores. Try same command again");
            console.error(error);
        });

    console.log("Uploaded highscores");
}

process.on('unhandledRejection', function(err) {
    console.log(err);
});
