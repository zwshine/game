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
            log('ws error', id, err)
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

export default {
    async fetch(request, env) {
        // We will use a fixed name for our Durable Object instance.
        // This ensures that all clients are routed to the same instance.
        const durableObjectName = "signaling-server-instance";
        
        // Get the Durable Object's unique ID from its name.
        const id = env.PEERJS_SERVER.idFromName(durableObjectName);
        
        // Get the stub for the Durable Object instance.
        const stub = env.PEERJS_SERVER.get(id);

        // Forward the request to the Durable Object.
        return stub.fetch(request);
    }
}; 