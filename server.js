const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let lobbies = {}; // Store active lobbies

// Serve static files
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/hstdet.html", (req, res) => res.sendFile(path.join(__dirname, "hstdet.html")));
app.get("/plyrdet.html", (req, res) => res.sendFile(path.join(__dirname, "plyrdet.html")));
app.get("/lobby.html", (req, res) => res.sendFile(path.join(__dirname, "lobby.html")));

wss.on("connection", (ws) => {
    ws.on("message", (data) => {
        const message = JSON.parse(data);

        if (message.type === "createLobby") {
            const roomID = Math.floor(10000 + Math.random() * 90000).toString();
            lobbies[roomID] = { host: message.username, hostIcon: message.icon, players: [] };

            ws.send(JSON.stringify({ type: "lobbyCreated", roomID }));
        } 
        
        else if (message.type === "joinLobby") {
            const { roomID, username, icon } = message;

            if (!lobbies[roomID]) {
                ws.send(JSON.stringify({ type: "notActive" }));
            } else if (!lobbies[roomID].host) {
                ws.send(JSON.stringify({ type: "hostNot" }));
            } else {
                lobbies[roomID].players.push({ username, icon });
                ws.send(JSON.stringify({ type: "lobbyJoined", roomID }));

                // Broadcast updated lobby state
                broadcastLobbyState(roomID);
            }
        }
    });
});

function broadcastLobbyState(roomID) {
    const lobbyState = {
        type: "lobbyState",
        players: lobbies[roomID]?.players || [],
        host: lobbies[roomID]?.host,
        hostIcon: lobbies[roomID]?.hostIcon
    };

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(lobbyState));
        }
    });
}

server.listen(3000, () => console.log("Server running on http://localhost:3000"));
