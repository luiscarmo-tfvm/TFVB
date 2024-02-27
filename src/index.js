const WebSocket = require('ws');
const readline = require('readline');
const fs = require('fs');
const { Client, GatewayIntentBits } = require('discord.js');
require("dotenv").config()

const discordBotToken = process.env.DISCORD_BOT_TOKEN
const discordClient = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

const questionsChannel = process.env.QUESTIONS_CHANNEL
const oAuth = process.env.OAUTH
const nick = process.env.NICK
const channel = process.env.CHANNEL

const socket = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
const reactionRequestsList = {};
let eventStartTime;
let eventDuration = 0; // Set the duration of the event in minutes
let timeLeft = 0;
const checkInterval = 1000; // Check every second
const pingInterval = 20000 // Rate of twitch PINGS
let lastMinuteWarning = false;
let finalRequestsList = [];

discordClient.on('ready', () => {
    console.log(`Logged in as ${discordClient.user.tag}`);
});

// Replace 'YOUR_BOT_TOKEN' with your actual bot token
discordClient.login(discordBotToken);


socket.addEventListener('open', () => {
    socket.send(`PASS oauth:${oAuth}`);
    socket.send(`NICK ${nick}`)
    socket.send(`JOIN #${channel}`)
})

socket.addEventListener('message', event => {
    try {
        console.log(event.data);
        pongThePing(event)
        reactionEventCommand(event)
        reactionCommand(event)
        reactionEventTimeLeft(event)
        questionCommand(event)
        questionHelpCommand(event)
    } catch (error) {
        console.error('Error:', error);
    }
})

// Periodically check if the event duration has passed
setInterval(() => {
    updateTimeLeft()
}, checkInterval)

setInterval(() => {
    console.log("Pinging twitch!")
    socket.send("PING :tmi.twitch.tv");
}, pingInterval)

const pongThePing = (e) => {
    if (e.data.includes("PING")) {
        const message = e.data.substring(6)
        socket.send(`PONG :${message}`);
    }
}

const reactionEventCommand = (e) => {
    if (timeLeft === 0) {
        const user = e.data.substring(e.data.indexOf(":") + 1, e.data.indexOf("!"))
        if (user === "luiscarmo_sings" && e.data.includes(" :!reactionEvent ")) {
            const messageIndex = e.data.indexOf(":!reactionEvent")
            const commandArgs = parseInt(e.data.substring(messageIndex + 16))
            if (!commandArgs) return
            eventStartTime = Date.now();
            eventDuration = commandArgs * 60000;
            timeLeft = commandArgs * 60000;
            socket.send(`PRIVMSG #${channel} :Suggestions for today's reaction are being collected for the next ${(eventDuration / 60000)} minutes! DinoDance Type \'!reaction <suggestion>\' to make your suggestion!`)
        }
    };
}

const reactionCommand = (e) => {
    if (e.data.includes(" :!reaction ")) {
        const user = e.data.substring(e.data.indexOf(":") + 1, e.data.indexOf("!"));
        if (timeLeft > 0) {
            const messageIndex = e.data.indexOf(":!reaction")
            const reaction = e.data.substring(messageIndex + 11)
            const isAChange = reactionRequestsList[user]
            reactionRequestsList[user] = reaction
            const message = `PRIVMSG #${channel} :@${user} Your reaction request has been successfully ${isAChange ? 'changed' : 'registered'}!`;
            socket.send(message)
        } else {
            socket.send(`PRIVMSG #${channel} :@${user} No event is running at the moment!`);
        }

    }
}

const reactionEventTimeLeft = (e) => {
    if (e.data.includes(" :!reactionEventTimeLeft")) {
        const user = e.data.substring(e.data.indexOf(":") + 1, e.data.indexOf("!"));
        if (timeLeft > 0) {
            const { minutes, seconds } = convertMillisecondsToMinutesAndSeconds(timeLeft);
            socket.send(`PRIVMSG #${channel} :@${user} Time left in the event: ${minutes ? minutes + " minutes and " : ""}${seconds} seconds!`);
        } else {
            socket.send(`PRIVMSG #${channel} :@${user} No event is running at the moment!`);
        }
    }
}

const updateTimeLeft = () => {
    if (eventStartTime && eventDuration > 0 && timeLeft > 0 && ((eventStartTime + (eventDuration)) - Date.now()) > 0) {
        timeLeft = ((eventStartTime + (eventDuration)) - Date.now())
        if (timeLeft <= 60000 && !lastMinuteWarning) {
            socket.send(`PRIVMSG #${channel} :Poll suggestions will be over in less than 1 minute!`)
            lastMinuteWarning = true;
        }
    } if (eventStartTime && eventDuration > 0 && timeLeft > 0 && ((eventStartTime + (eventDuration)) - Date.now()) <= 0) {
        eventDuration = 0;
        timeLeft = 0;
        eventStartTime = 0;
        lastMinuteWarning = false;
        prepList();
        socket.send(`PRIVMSG #${channel} :Poll suggestions event is now over! Thanks for participating! TwitchConHYPE`)
    }
}

const prepList = () => {
    Object.values(reactionRequestsList).forEach(rr => console.log(rr))
    const pollSize = Object.keys(reactionRequestsList).length > 5 ? 5 : Object.keys(reactionRequestsList).length
    let prompt = "Choose the suggestions you want to exclude:\n"
    let suggestions = []
    let change = 0
    if (pollSize === 0) return
    for (let i = 0; i < pollSize; i++) {
        var keysArray = Object.keys(reactionRequestsList);
        console.log("Keys Array: " + keysArray)
        var randomSuggestionKey = keysArray[Math.floor(Math.random() * keysArray.length)];
        console.log("Random Suggestion: " + randomSuggestionKey)
        const selectedElement = reactionRequestsList[randomSuggestionKey]
        finalRequestsList.push(selectedElement);
        delete reactionRequestsList[randomSuggestionKey]
        suggestions[i] = `${selectedElement}`
        prompt = prompt.concat((i + 1) + " - " + selectedElement + "\n")
    }
    do {
        isChangeNeeded({ prompt, suggestions, change })
    } while (change !== 0)
}


const isChangeNeeded = ({ prompt, suggestions, change }) => {
    rl.question(prompt, (answer) => {
        change = parseInt(answer);
        if (change === 0) {
            prompt = ""
            for (let i = 0; i < finalRequestsList.length; i++) {
                prompt = prompt.concat((i + 1) + " - " + suggestions[i] + "\n")
            }
            console.log("Final List: " + prompt)
            fs.writeFile('suggestionList.txt', prompt, 'utf8', (err) => {
                if (err) {
                    console.error('Error writing to file:', err);
                } else {
                    console.log('Text has been written to the file');
                }
            });
            rl.close();
            return;
        }
        finalRequestsList.splice((change - 1), 1)
        console.log("FINAL LIST AFTER REMOVAL: " + finalRequestsList)
        if (Object.keys(reactionRequestsList).length > 0) {
            var keysArray = Object.keys(reactionRequestsList);
            var randomSuggestionKey = keysArray[Math.floor(Math.random() * keysArray.length)];
            const selectedElement = reactionRequestsList[randomSuggestionKey]
            finalRequestsList.push(selectedElement);
            delete reactionRequestsList[randomSuggestionKey]
            suggestions[change - 1] = `${selectedElement}`
        }
        prompt = "Choose the suggestions you want to exclude:\n"
        for (let i = 0; i < finalRequestsList.length; i++) {
            prompt = prompt.concat((i + 1) + " - " + suggestions[i] + "\n")
        }
        isChangeNeeded({ prompt, suggestions, change });
    });
}

const questionCommand = (e) => {
    if (e.data.includes(" :!question ")) {
        const user = e.data.substring(e.data.indexOf(":") + 1, e.data.indexOf("!"));
        const messageIndex = e.data.indexOf(":!question")
        const question = e.data.substring(messageIndex + 11)
        const discordChannel = discordClient.channels.cache.get(questionsChannel);

        if (discordChannel && discordChannel.type === 0) {
            // Send a message to the specific channel
            socket.send(`PRIVMSG #${channel} :@${user} Your question has been registered! TwitchVotes`)
            discordChannel.send("**" + user + "**: " + question);
        } else {
            console.error('Channel not found or not a text channel.');
        }
    }
}

const questionHelpCommand = (e) => {
    if (e.data.includes(" :!questionHelp")) {
        socket.send(`PRIVMSG #${channel} :To use the question command write !question {your_question}`)
    }
}
// ...

// Close the readline interface when the program exits
process.on('exit', () => {
    rl.close();
});

// Handle user interruption (e.g., Ctrl+C)
process.on('SIGINT', () => {
    rl.close();
    process.exit();
});

socket.addEventListener('close', () => {
    console.log('WebSocket connection closed');
    // ... rest of your 'close' event handling code
});

socket.addEventListener('error', (error) => {
    console.error('WebSocket error:', error);
    // ... rest of your 'error' event handling code
});

function convertMillisecondsToMinutesAndSeconds(milliseconds) {
    // Calculate total seconds
    const totalSeconds = Math.floor(milliseconds / 1000);

    // Calculate minutes and remaining seconds
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return { minutes, seconds };
}