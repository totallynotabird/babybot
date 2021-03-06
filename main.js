/*
* This is a discord bot build by copying and converting ava-discordbot then tailoring it for my personal use
*
* Music functionality temporarly stolen from Pod.fm
*
* You can find the source this is based on at:
* https://github.com/JamesLongman/ava-discordbot
* https://github.com/Monskiller/podfm
*/


const fs = require('fs');
const package = require('./package.json')

// Checks for a config file otherwise creates a template

if (!fs.existsSync('./config.json')) {
    console.log('config file not found, a template will be provided')
    createTemplate()
} else {
    // actually starts the bot and keeps it running
    console.log('config file found')
    console.log(`initializing bot, version: ${package.version}`)
    let bot = require('./bot.js')
    bot.startup()
}

// creates a template to load your credentials from

function createTemplate() {
    let stream = fs.createWriteStream("config.json");
    stream.once('open', function(fd) {
    stream.write(`{{"keys":{"token": "","gfykey": "","ytapikey": ""},"id":{"botuserid": "","ownerID": "","botId": ""},"options":{"prefix": "/","embedColour":"4492543","maxQueue":"50","maxPlaylist":"25"},"users":{"owners":"","blocked":[]}}`);
    stream.end();
    console.log('template build please suply it with your credentials')
    });
}