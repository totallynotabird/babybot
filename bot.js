const discord = require('discord.js');
const responseObject = require("./responses.json");
const fs = require('fs');
const sf = require("snekfetch");
permissions = require("./utilities/permutil.js");



client = null;
/* Global variables for connection control (discord.js has its own client reconnection handling but
it can sometimes fail, particularly when using the optional UWS peer dependency) */
// If the client is currently logging in
let loggingIn = false;
// Timeout after which to consider login failed and trigger the restart process
let startClock = false;
// Upon disconnect if client doesn't reconnect in time we will take over
let restartClock = null;


module.exports = {
    startup() {

loggingIn = true;
setStartClock();

if (client) { client.bot.destroy(); }

client = {
    bot: new discord.Client({
        disableEvents: {
		    "GUILD_BAN_ADD"  : true,
		    "GUILD_BAN_REMOVE" : true,
		    "MESSAGE_DELETE" : true,
		    "MESSAGE_DELETE_BULK" : true,
		    "MESSAGE_UPDATE" : true,
		    "PRESENCE_UPDATE" : true,
		    "TYPING_START" : true,
		    "USER_UPDATE" : true
	    },
        messageCacheMaxSize: 20,
        disableEveryone: true
    }),
    config: require('./config.json'),
    queues: {},
    blacklist: require("./data/blacklist.json"),
    prefixes: require("./data/prefixes.json"),
    volume: require("./data/volume.json")
    }

// Attempt to log the client in
client.bot.login(client.config.keys.token)
    .then(() => {
        // Successfull log in so clear timers
        clearStartClock();
        clearRestartClock(true);
        console.log('login succesful');
        loggingIn = false;
    })
    .catch(() => {
        //log.info('login failed');
        loggingIn = false;
        restart();
    });

// Emitted when the bot client is ready (event emmited on succesful login and reconnections)
client.bot.on('ready', () => {
    // Successfull log in or reconnection so clear timers
    clearStartClock();
    clearRestartClock(true);
    client.bot.guilds.forEach(g => {
		if (!client.prefixes[g.id]) client.prefixes[g.id] = client.config.options.prefix;
		if (!client.queues[g.id]) client.queues[g.id] = { id: g.id, messageChannel: "", dj: "", queue: [], svotes: [], repeat: false, auto: false};
        if (!client.volume[g.id]) client.volume[g.id] = { id: g.id, volume:"0.1"}
        if (!client.blacklist[g.id]) client.blacklist[g.id] = {id: g.id, list: []}
    });
});

// On reconnect attempts
client.bot.on('reconnecting', () => {
clearRestartClock(false);
console.log('reconnect attempt event');
});

// Emitted for general warnings
client.bot.on('warn', (warning) => {
    console.log('warning:'+ warning);
});

client.bot.on("voiceStateUpdate",() => {
    client.bot.voiceConnections.forEach((element) =>{
        if (element.channel.members.size <= 1){
            if(client.queues[element.channel.guild.id].auto) {
                client.queues[element.channel.guild.id].auto = false
            }
        }
    })
})

client.bot.on("guildCreate", g => {
	g.defaultChannel.send(`Waddup! This is **${client.bot.user.username}**, thank you for inviting me. You can view my commands with '${client.config.options.prefix}help'. Please report any issues on the github page (${client.config.options.prefix}github)`);

	client.prefixes[g.id] = client.config.options.prefix;
    client.queues[g.id] = { id: g.id, messageChannel: "", queue: [], svotes: [], repeat: "None" };
    client.blacklist[g.id] = { id: g.id };
});

client.bot.on("guildDelete", g => {
	delete client.prefixes[g.id];
	delete client.queues[g.id];
});

client.bot.on('message', message => {
	if (message.author.bot) return;
    if(responseObject[message.content]) {            
        message.channel.send(responseObject[message.content]);
        return
	}
	if (!message.content.startsWith(client.prefixes[message.guild.id]) && !message.content.startsWith(`<@${client.bot.user.id}>`)) return;

    let command;
    let args;
    let options

    if (message.content.startsWith(client.prefixes[message.guild.id])){
        options = readOptions(message)
	    command = message.content.split(' ')[0];
        command = command.slice(client.prefixes[message.guild.id].length);
        args = message.content.replace(/(--\S+)/g,"")
	    args = args.split(' ').slice(1);
    } else if (message.content.startsWith(`<@${client.bot.user.id}>`)){
        command = message.content.split(' ')[1];
	    args = message.content.replace(/(--\S+)/g,"")
	    args = args.split(' ').slice(2);
        if(command === undefined) {
            message.channel.send(`for help with the commands try ${client.config.options.prefix}help.`)
            return
        }
    }

    delete require.cache[require.resolve("./data/aliasses.json")];
	let aliases = require("./data/aliasses.json");
    if (aliases[command]) command = aliases[command];

	// looks if the command is valid and executes it.
	try {
		let commandFile = require(`./commands/${command}.js`)
		message.react("\u2611");
		commandFile.run(message, args, options);
        delete require.cache[require.resolve(`./commands/${command}.js`)]
		} catch (err) {
        message.channel.send(`${command} is not a valid command!`)
    	console.error(err);
	    }
    });
}, 
};

// Clear the restart clock, success arguement to indicate if we need to also restart the clock
function clearRestartClock(success) {
    if (restartClock) {
        //log.debug('restart clock cleared');
        clearTimeout(restartClock);
        restartClock = null;
    }

    /* If we want to reset the timeout in the case that the client is actually making attempts to reconnect
    a false arguement should be passed */
    if (!success) {
        setRestartClock();
    }
}

// Clear start clock, this will be used upon succesful log in
function clearStartClock() {
    if (startClock) {
        //log.debug('start clock cleared');
        clearInterval(startClock);
        startClock = null;
    }
}




/* To be called to either restart the client in the case of failed reconnection handling, or to periodically
make sure that the client is attempting to log in */
function restart() {
    console.log('Restart called');
    if (loggingIn) {
        return;
    }
    loggingIn = true;
    if (client.bot.uptime === null) {
        console.log('info: Client connection failed, attempting to reconnect');
        if (client.bot !== null) {
            client.bot = null;
        }
        module.exports.startup();
    } else {
        console.log('warn: Client connection handling failed, destroying client, re-attempting connection...');
        client.bot.destroy()
            .then(() => {
                module.exports.startup();
            })
            .catch(() => {
                /* At this point the client has failed to connect, and it has also failed to destroy itself, the
                only remaining recourse is to entirely restart the process */
                process.exit(1);
            });
    }
}

/* Clock to be used when the client is reconnecting, the timeout here is much longer at 60 seconds to
give discord.js's client reconnection handling a chance, every time the client makes some indication
it is at least attempting to reconnect this clock will be restarted. If 60 seconds pass with no indication
then the restart function will take over */
function setRestartClock() {
    if (!restartClock) {
        console.log('debug: restart clock started');
        restartClock = setTimeout(restart, 60000);
    }
}

/* Start a clock on login attempts, make call restart regularly to make sure the client is attempting to
log in */
function setStartClock() {
    if (!startClock) {
        console.log('debug: start clock started');
        startClock = setInterval(restart, 3000);
    }
}

function readOptions(message){
    message = message.content.slice(client.prefixes[message.guild.id].length);    
    return message.match(/(--\S+)/g)    
}