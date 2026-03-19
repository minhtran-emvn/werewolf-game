/**
 * Werewolf Multiplayer - PeerJS WebRTC Implementation
 * Handles real-time communication between players
 */

class MultiplayerWerewolf {
    constructor() {
        this.peer = null;
        this.peerId = null;
        this.connections = [];
        this.isHost = false;
        this.roomId = null;
        this.players = [];
        this.gameState = 'lobby'; // lobby, playing, finished
        this.messageHandlers = {};
        
        // Game state synchronization
        this.lastSyncedState = null;
        this.pendingActions = [];
    }

    /**
     * Initialize PeerJS connection
     */
    async initialize(isHost = false) {
        return new Promise((resolve, reject) => {
            // Load PeerJS script dynamically if not already loaded
            if (typeof Peer === 'undefined') {
                const script = document.createElement('script');
                script.src = 'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js';
                script.onload = () => this.createPeer(isHost, resolve, reject);
                script.onerror = reject;
                document.head.appendChild(script);
            } else {
                this.createPeer(isHost, resolve, reject);
            }
        });
    }

    createPeer(isHost, resolve, reject) {
        this.isHost = isHost;
        
        // Generate room ID or use custom one
        this.roomId = isHost ? this.generateRoomId() : null;
        
        this.peer = new Peer(this.roomId, {
            debug: 2
        });

        this.peer.on('open', (id) => {
            this.peerId = id;
            this.roomId = id;
            console.log('Connected to PeerJS server:', id);
            
            if (isHost) {
                this.players.push({
                    id: id,
                    name: 'Host',
                    isHost: true,
                    connected: true
                });
            }
            
            resolve({ roomId: id, isHost });
        });

        this.peer.on('connection', (conn) => {
            this.handleIncomingConnection(conn);
        });

        this.peer.on('error', (err) => {
            console.error('PeerJS error:', err);
            reject(err);
        });

        this.peer.on('close', () => {
            console.log('Peer connection closed');
            this.handlePeerClose();
        });
    }

    /**
     * Generate a short room ID
     */
    generateRoomId() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return `WW-${result}`;
    }

    /**
     * Connect to an existing room
     * Fixed: Better error handling for non-existent rooms
     */
    async joinRoom(roomId, playerName) {
        return new Promise((resolve, reject) => {
            const conn = this.peer.connect(roomId);
            
            // Timeout after 5 seconds if no response (room doesn't exist)
            const timeout = setTimeout(() => {
                conn.close();
                reject(new Error('Phòng không tồn tại hoặc đã đóng: ' + roomId));
            }, 5000);
            
            conn.on('open', () => {
                clearTimeout(timeout);
                this.connections.push(conn);
                this.roomId = roomId;
                
                // Send join request
                this.sendData(conn, {
                    type: 'JOIN_REQUEST',
                    playerName: playerName,
                    playerId: this.peerId
                });
                
                resolve(conn);
            });

            conn.on('error', (err) => {
                clearTimeout(timeout);
                reject(new Error('Không thể kết nối phòng: ' + roomId));
            });
            
            // Handle connection refused (room doesn't exist)
            conn.on('close', () => {
                if (this.connections.indexOf(conn) === -1) {
                    // Connection closed before being added - likely doesn't exist
                    clearTimeout(timeout);
                    reject(new Error('Phòng không tồn tại: ' + roomId));
                }
            });
        });
    }

    /**
     * Handle incoming peer connection
     */
    handleIncomingConnection(conn) {
        this.connections.push(conn);
        
        conn.on('data', (data) => {
            this.handleMessage(conn, data);
        });

        conn.on('close', () => {
            this.handleDisconnect(conn);
        });
    }

    /**
     * Handle incoming message
     */
    handleMessage(conn, data) {
        console.log('Received message:', data);
        
        switch (data.type) {
            case 'JOIN_REQUEST':
                this.handleJoinRequest(conn, data);
                break;
            case 'JOIN_ACCEPTED':
                this.handleJoinAccepted(data);
                break;
            case 'PLAYER_UPDATE':
                this.handlePlayerUpdate(data);
                break;
            case 'GAME_STATE_UPDATE':
                this.handleGameStateUpdate(data);
                break;
            case 'CHAT_MESSAGE':
                this.handleChatMessage(data);
                break;
            case 'NIGHT_ACTION':
                this.handleNightAction(data);
                break;
            case 'VOTE':
                this.handleVote(data);
                break;
            default:
                console.log('Unknown message type:', data.type);
        }

        // Call custom handlers
        if (this.messageHandlers[data.type]) {
            this.messageHandlers[data.type](data, conn);
        }
    }

    /**
     * Handle join request (host only)
     * Fixed: Also update host's local player list
     */
    handleJoinRequest(conn, data) {
        if (!this.isHost) return;
        
        const newPlayer = {
            id: data.playerId,
            name: data.playerName,
            isHost: false,
            connected: true
        };
        
        this.players.push(newPlayer);
        
        // Send acceptance with current player list
        this.sendData(conn, {
            type: 'JOIN_ACCEPTED',
            playerId: data.playerId,
            players: this.players
        });
        
        // Broadcast player update to all connected clients
        this.broadcast({
            type: 'PLAYER_UPDATE',
            players: this.players
        });
        
        // Trigger local handler to update host's UI
        if (this.messageHandlers['PLAYER_UPDATE']) {
            this.messageHandlers['PLAYER_UPDATE']({
                players: this.players
            });
        }
    }

    /**
     * Handle join acceptance (client only)
     */
    handleJoinAccepted(data) {
        this.players = data.players;
        console.log('Joined room, players:', this.players);
    }

    /**
     * Handle player update
     */
    handlePlayerUpdate(data) {
        this.players = data.players;
        if (this.messageHandlers['PLAYER_UPDATE']) {
            this.messageHandlers['PLAYER_UPDATE'](data);
        }
    }

    /**
     * Handle game state update
     */
    handleGameStateUpdate(data) {
        this.gameState = data.gameState;
        if (this.messageHandlers['GAME_STATE_UPDATE']) {
            this.messageHandlers['GAME_STATE_UPDATE'](data);
        }
    }

    /**
     * Handle chat message
     */
    handleChatMessage(data) {
        if (this.messageHandlers['CHAT_MESSAGE']) {
            this.messageHandlers['CHAT_MESSAGE'](data);
        }
    }

    /**
     * Handle night action
     */
    handleNightAction(data) {
        if (this.isHost && this.messageHandlers['NIGHT_ACTION']) {
            this.messageHandlers['NIGHT_ACTION'](data);
        }
    }

    /**
     * Handle vote
     */
    handleVote(data) {
        if (this.isHost && this.messageHandlers['VOTE']) {
            this.messageHandlers['VOTE'](data);
        }
    }

    /**
     * Handle disconnect
     * Enhanced: Host migration when host disconnects
     */
    handleDisconnect(conn) {
        const disconnectedPlayerId = conn.peer;
        const index = this.connections.indexOf(conn);
        if (index > -1) {
            this.connections.splice(index, 1);
        }
        
        // Find and remove player
        const playerIndex = this.players.findIndex(p => p.id === disconnectedPlayerId);
        let disconnectedPlayerName = 'Unknown';
        if (playerIndex > -1) {
            disconnectedPlayerName = this.players[playerIndex].name;
            this.players.splice(playerIndex, 1);
            
            if (this.isHost) {
                this.broadcast({
                    type: 'PLAYER_UPDATE',
                    players: this.players
                });
            }
        }
        
        // HOST DISCONNECT: Migrate host to oldest client
        if (this.isHost && disconnectedPlayerId === this.peerId) {
            console.log('Host disconnecting, migrating...');
            // This shouldn't happen normally, but handle gracefully
            this.leave();
            return;
        }
        
        // CLIENT disconnects - already handled above
        
        // Notify about disconnect
        if (this.messageHandlers['PLAYER_DISCONNECTED']) {
            this.messageHandlers['PLAYER_DISCONNECTED']({
                playerId: disconnectedPlayerId,
                playerName: disconnectedPlayerName
            });
        }
    }

    /**
     * Handle peer connection close (for clients when host disconnects)
     */
    handlePeerClose() {
        if (this.messageHandlers['HOST_DISCONNECTED']) {
            this.messageHandlers['HOST_DISCONNECTED']();
        }
    }

    /**
     * Send data to a specific connection
     */
    sendData(conn, data) {
        if (conn && conn.open) {
            conn.send(data);
        }
    }

    /**
     * Broadcast to all connections
     */
    broadcast(data, excludeConn = null) {
        this.connections.forEach(conn => {
            if (conn !== excludeConn && conn.open) {
                this.sendData(conn, data);
            }
        });
    }

    /**
     * Send chat message
     */
    sendChatMessage(playerName, message) {
        const chatData = {
            type: 'CHAT_MESSAGE',
            playerName: playerName,
            message: message,
            timestamp: Date.now()
        };
        
        if (this.isHost) {
            this.broadcast(chatData);
            // Also handle locally
            this.handleChatMessage(chatData);
        } else {
            // Send to host
            if (this.connections.length > 0) {
                this.sendData(this.connections[0], chatData);
            }
        }
    }

    /**
     * Send night action (host collects and processes)
     * Enhanced: Support Witch heal/poison action
     */
    sendNightAction(playerId, role, targetId, witchAction = null) {
        const actionData = {
            type: 'NIGHT_ACTION',
            playerId: playerId,
            role: role,
            targetId: targetId,
            witchAction: witchAction, // 'heal', 'poison', or null
            timestamp: Date.now()
        };
        
        if (this.isHost) {
            // Host processes immediately
            if (this.messageHandlers['NIGHT_ACTION']) {
                this.messageHandlers['NIGHT_ACTION'](actionData);
            }
        } else {
            // Send to host
            if (this.connections.length > 0) {
                this.sendData(this.connections[0], actionData);
            }
        }
    }

    /**
     * Send vote
     */
    sendVote(voterId, targetId) {
        const voteData = {
            type: 'VOTE',
            voterId: voterId,
            targetId: targetId,
            timestamp: Date.now()
        };
        
        if (this.isHost) {
            if (this.messageHandlers['VOTE']) {
                this.messageHandlers['VOTE'](voteData);
            }
        } else {
            if (this.connections.length > 0) {
                this.sendData(this.connections[0], voteData);
            }
        }
    }

    /**
     * Update game state (host only)
     */
    updateGameState(gameState, additionalData = {}) {
        if (!this.isHost) return;
        
        const updateData = {
            type: 'GAME_STATE_UPDATE',
            gameState: gameState,
            ...additionalData
        };
        
        this.gameState = gameState;
        this.broadcast(updateData);
        this.handleGameStateUpdate(updateData);
    }

    /**
     * Register message handler
     */
    on(messageType, handler) {
        this.messageHandlers[messageType] = handler;
    }

    /**
     * Get current room info
     */
    getRoomInfo() {
        return {
            roomId: this.roomId,
            isHost: this.isHost,
            playerCount: this.players.length,
            players: this.players,
            gameState: this.gameState
        };
    }

    /**
     * Leave room
     */
    leave() {
        this.connections.forEach(conn => conn.close());
        if (this.peer) {
            this.peer.destroy();
        }
        this.connections = [];
        this.players = [];
        this.gameState = 'lobby';
    }

    /**
     * Start game (host only)
     */
    startGame(roles) {
        if (!this.isHost) return;
        
        // Assign roles to players
        const shuffledRoles = [...roles];
        // Fisher-Yates shuffle
        for (let i = shuffledRoles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledRoles[i], shuffledRoles[j]] = [shuffledRoles[j], shuffledRoles[i]];
        }
        
        // Send roles to each player (secretly)
        this.players.forEach((player, index) => {
            const roleData = {
                type: 'ROLE_ASSIGNMENT',
                playerId: player.id,
                role: shuffledRoles[index]
            };
            
            // Find connection for this player
            const conn = this.connections.find(c => c.peer === player.id);
            if (conn) {
                this.sendData(conn, roleData);
            }
        });
        
        // Broadcast game start
        this.updateGameState('playing', {
            phase: 'night',
            dayCount: 0
        });
    }
}

// Export for use in main game
window.MultiplayerWerewolf = MultiplayerWerewolf;
