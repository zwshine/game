//
// The MIT License (MIT)
//
// Copyright (c) 2019-2022 The PeerJS Server Authors
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
//

// This is a fork of https://github.com/peerjs/peerjs-server
// It is modified to run on Cloudflare Workers.
// It is a single-file, no-dependency, and fully-functional PeerJS server.

import { PeerServer } from "peer";

const log = (...args) => console.log(...args);

const WS_READY_STATE_OPEN = 1;

const MessageType = {
    OPEN: "OPEN",
    LEAVE: "LEAVE",
    CANDIDATE: "CANDIDATE",
    OFFER: "OFFER",
    ANSWER: "ANSWER",
    EXPIRE: "EXPIRE",
    HEARTBEAT: "HEARTBEAT",
};

/**
 * A class that manages the signaling server.
 * It is designed to be used in a Cloudflare Worker environment.
 * It can be used with Durable Objects to provide a more robust and scalable solution.
 */
class PeerJSWSServer {
    constructor(state) {
        this.state = state;
        this.sessions = new Map(); // key: ws, value: { id, timer, }
        this.clients = new Map(); // key: id, value: ws
    }

    async fetch(request) {
        const url = new URL(request.url);
        const peerId = url.searchParams.get("id");
        const a = url.pathname.split("/");
        //pathname is like /peerjs/myapp/0.1.0/peerid/websocket
        const clientId = a.length > 3 ? a[a.length - 2] : peerId;
        
        if (!clientId) {
            return new Response("Client ID is required", { status: 400 });
        }

        if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
            return new Response("request isn't trying to upgrade to websocket.", { status: 400 });
        }

        const { webSocket, response } = new WebSocketPair();

        webSocket.accept();

        this.handleWebSocket(webSocket, clientId);

        return response;
    }

    handleWebSocket(ws, id) {
        log(`handleWebSocket: id=${id}`);

        ws.addEventListener("message", (msg) => {
            this.onSocketMessage(ws, id, msg.data);
        });

        ws.addEventListener("close", () => {
            this.onSocketClose(ws, id);
        });

        ws.addEventListener("error", (err) => {
            log('ws error', id, err.message, err.stack);
            this.onSocketClose(ws, id);
        });
    }

    startExpiration(ws) {
        log(`startExpiration for ws of id=${this.sessions.get(ws)?.id}`);
        const session = this.sessions.get(ws);
        if (session) {
            clearTimeout(session.timer);
            session.timer = setTimeout(() => {
                log(`EXPIRE: id=${session.id}`);
                this.onSocketClose(ws, session.id);
            }, 30000);
        }
    }

    onSocketMessage(ws, id, message) {
        log("onSocketMessage", id, message);
        let data;

        try {
            data = JSON.parse(message);
        } catch (e) {
            log("Invalid message", message);
            return;
        }

        const { type, dst, src, payload } = data;

        if (type === MessageType.OPEN) {
            this.onSocketOpen(ws, id);
            return;
        }
        if (type === MessageType.HEARTBEAT) {
            this.startExpiration(ws);
            return;
        }

        if (!dst || !this.clients.has(dst)) {
            log(`Destination client ${dst} not found`);
            return;
        }

        const dest = this.clients.get(dst);

        if (dest && dest.readyState === WS_READY_STATE_OPEN) {
            dest.send(JSON.stringify({ type, src: src || id, dst, payload }));
        }
    }

    onSocketOpen(ws, id) {
        log(`onSocketOpen: id=${id}`);
        if (this.clients.has(id)) {
            const oldWs = this.clients.get(id);
            if (oldWs && oldWs.readyState === WS_READY_STATE_OPEN) {
                oldWs.close(1001, "ID-taken");
            }
        }

        this.clients.set(id, ws);
        this.sessions.set(ws, { id, timer: null });
        ws.send(JSON.stringify({ type: MessageType.OPEN }));
        this.startExpiration(ws);
    }
    
    onSocketClose(ws, id) {
        log(`onSocketClose: id=${id}`);
        const session = this.sessions.get(ws);
        if (session) {
            clearTimeout(session.timer);
            this.sessions.delete(ws);
        }
        if (this.clients.get(id) === ws) {
            this.clients.delete(id);
        }
    }
}

//This is for Durable Object
export class PeerJSServer {
    constructor(state, env) {
      this.server = new PeerJSWSServer(state);
    }
    async fetch(request) {
      return this.server.fetch(request);
    }
}

// Helper to get a random element from an array
const getRandomEl = (arr) => arr[Math.floor(Math.random() * arr.length)];

// List of nouns and adjectives for generating random IDs
const ADJECTIVES = ["happy", "silly", "lazy", "proud", "smart", "brave"];
const NOUNS = ["panda", "dragon", "unicorn", "tiger", "eagle", "wizard"];

// --- Matchmaking Queue Class ---
class MatchmakingQueue {
    constructor(db) {
        this.db = db;
    }

    // Initialize the database table if it doesn't exist
    async init() {
        const query = `
            CREATE TABLE IF NOT EXISTS matchmaking_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                peer_id TEXT NOT NULL UNIQUE,
                game_type TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'waiting',
                opponent_peer_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await this.db.prepare(query).run();
    }

    // Add a player to the queue or find a match for them
    async findOrQueue(peerId, gameType) {
        // Find a waiting player for the same game type
        const findQuery = `
            SELECT peer_id FROM matchmaking_queue
            WHERE game_type = ? AND status = 'waiting'
            ORDER BY created_at ASC
            LIMIT 1;
        `;
        const waitingPlayer = await this.db.prepare(findQuery).bind(gameType).first();

        if (waitingPlayer) {
            // Found a match
            const opponentPeerId = waitingPlayer.peer_id;
            // Remove the matched player from the queue
            const deleteQuery = "DELETE FROM matchmaking_queue WHERE peer_id = ?";
            await this.db.prepare(deleteQuery).bind(opponentPeerId).run();
            return { matched: true, opponent_peer_id: opponentPeerId };
        } else {
            // No match found, add this player to the queue
            const insertQuery = "INSERT OR REPLACE INTO matchmaking_queue (peer_id, game_type) VALUES (?, ?)";
            await this.db.prepare(insertQuery).bind(peerId, gameType).run();
            return { matched: false };
        }
    }
    
    // Remove a player from the queue (e.g., if they cancel)
    async removeFromQueue(peerId) {
        const deleteQuery = "DELETE FROM matchmaking_queue WHERE peer_id = ?";
        await this.db.prepare(deleteQuery).bind(peerId).run();
    }

     // Clean up stale entries (e.g., older than 5 minutes)
     async cleanup() {
        const cleanupQuery = "DELETE FROM matchmaking_queue WHERE created_at < datetime('now', '-5 minutes')";
        await this.db.prepare(cleanupQuery).run();
    }
}

// --- Main Worker Fetch Handler ---
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // Initialize matchmaking queue helper
        const queue = new MatchmakingQueue(env.DB);
        ctx.waitUntil(queue.cleanup()); // Run cleanup in the background

        // --- API Route for Matchmaking ---
        if (url.pathname.startsWith("/match")) {
            await queue.init(); // Ensure table exists

            if (request.method === 'POST') {
                try {
                    const { peerId, gameType } = await request.json();
                    if (!peerId || !gameType) {
                        return new Response('Missing peerId or gameType', { status: 400 });
                    }
                    const result = await queue.findOrQueue(peerId, gameType);
                    return new Response(JSON.stringify(result), {
                        headers: { 'Content-Type': 'application/json' },
                    });
                } catch (e) {
                    return new Response(`Error processing match request: ${e.message}`, { status: 500 });
                }
            }
            
            if (request.method === 'DELETE') {
                 try {
                    const { peerId } = await request.json();
                    if (!peerId) {
                        return new Response('Missing peerId', { status: 400 });
                    }
                    await queue.removeFromQueue(peerId);
                    return new Response('Removed from queue', { status: 200 });
                } catch (e) {
                    return new Response(`Error processing cancellation: ${e.message}`, { status: 500 });
                }
            }

            return new Response('Unsupported method for /match', { status: 405 });
        }

        // --- Existing PeerJS Server Logic ---
        const peerServer = PeerServer({
            generateClientId: () => `${getRandomEl(ADJECTIVES)}-${getRandomEl(NOUNS)}`,
        }, async (peer) => {
            // This part of the code is executed when a new peer connects
            // console.log("Peer connected with id:", peer.getId());
            
            // You can add logic here when a peer connects, for example, logging.
            
            peer.on("disconnect", () => {
                // console.log("Peer disconnected with id:", peer.getId());
                // If a peer disconnects, we might want to remove them from the matchmaking queue.
                ctx.waitUntil(queue.removeFromQueue(peer.getId()));
            });

            peer.on("error", (error) => {
                // console.error("Peer error:", error);
            });
        });

        return peerServer.fetch(request);
    }
};