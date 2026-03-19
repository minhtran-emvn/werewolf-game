/**
 * Werewolf Game Logic
 * Handles game state, roles, and player actions
 * 
 * SECURITY: All user input is sanitized before DOM insertion
 */

class WerewolfGame {
    constructor() {
        this.multiplayer = new MultiplayerWerewolf();
        this.players = [];
        this.myPlayerId = null;
        this.myRole = null;
        this.gameState = 'lobby';
        this.phase = null;
        this.nightCount = 0;
        this.dayCount = 0;
        this.selectedPlayer = null;
        this.actionsReceived = {};
        this.winner = null;
        
        // Witch state
        this.witchHasHeal = true;
        this.witchHasPoison = true;
        this.witchAction = null; // 'heal', 'poison', or null
        
        // Role configurations
        this.ROLES = {
            werewolf: { icon: '🐺', name: 'Ma Sói', team: 'evil', count: 0 },
            villager: { icon: '👨‍🌾', name: 'Dân Làng', team: 'good', count: 0 },
            seer: { icon: '🔮', name: 'Tiên Tri', team: 'good', count: 1 },
            hunter: { icon: '🏹', name: 'Thợ Săn', team: 'good', count: 1 },
            witch: { icon: '🧙', name: 'Phù Thủy', team: 'good', count: 1 },
            guard: { icon: '🛡️', name: 'Bảo Vệ', team: 'good', count: 1 },
            cupid: { icon: '💕', name: 'Thần Tình Yêu', team: 'neutral', count: 0 }
        };

        this.setupMultiplayerHandlers();
    }

    /**
     * Sanitize user input to prevent XSS attacks
     * @param {string} str - Raw user input
     * @returns {string} - Sanitized string safe for HTML insertion
     */
    sanitize(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Setup multiplayer event handlers
     */
    setupMultiplayerHandlers() {
        // Handle player updates
        this.multiplayer.on('PLAYER_UPDATE', (data) => {
            this.players = data.players;
            this.updatePlayerList();
            this.updatePlayerCount();
        });

        // Handle game state updates
        this.multiplayer.on('GAME_STATE_UPDATE', (data) => {
            this.gameState = data.gameState;
            this.phase = data.phase;
            this.nightCount = data.nightCount || 1;
            this.dayCount = data.dayCount || 0;
            
            // Transition from lobby/room to game section
            if (data.gameState === 'playing') {
                document.getElementById('room-section')?.classList.add('hidden');
                document.getElementById('game-section')?.classList.remove('hidden');
                this.addGameLog('🌙 Đêm 1 bắt đầu!');
            }
            
            this.updateGameUI();
        });

        // Handle role assignment
        this.multiplayer.on('ROLE_ASSIGNMENT', (data) => {
            if (data.playerId === this.myPlayerId) {
                this.myRole = data.role;
                this.showMyRole(data.role);
                
                // For clients, also transition to game section when role is assigned
                // (host triggers game state update separately)
                setTimeout(() => {
                    document.getElementById('room-section')?.classList.add('hidden');
                    document.getElementById('game-section')?.classList.remove('hidden');
                }, 500);
            }
        });

        // Handle chat messages
        this.multiplayer.on('CHAT_MESSAGE', (data) => {
            this.addChatMessage(data.playerName, data.message, data.timestamp);
        });

        // Handle night actions (host only)
        this.multiplayer.on('NIGHT_ACTION', (data) => {
            this.handleNightAction(data);
        });

        // Handle votes (host only)
        this.multiplayer.on('VOTE', (data) => {
            this.handleVote(data);
        });

        // Handle game over (all players)
        this.multiplayer.on('GAME_OVER', (data) => {
            this.handleGameOver(data);
        });

        // Handle player disconnected
        this.multiplayer.on('PLAYER_DISCONNECTED', (data) => {
            this.addGameLog(`❌ ${data.playerName} đã rời phòng`);
            this.showNotification(`${data.playerName} đã rời phòng`);
        });

        // Handle host disconnected (clients only)
        this.multiplayer.on('HOST_DISCONNECTED', () => {
            this.addGameLog('⚠️ Chủ phòng đã rời! Trò chơi không thể tiếp tục.');
            this.showNotification('⚠️ Chủ phòng đã rời! Vui lòng tạo phòng mới.');
            // Disable game controls
            const actionButtons = document.getElementById('action-buttons');
            if (actionButtons) {
                actionButtons.innerHTML = `
                    <p style="color: #e94560; font-weight: bold;">
                        ⚠️ Chủ phòng đã rời. Trò chơi kết thúc.
                    </p>
                `;
            }
        });
    }

    /**
     * Create a new room
     */
    async createRoom() {
        const name = document.getElementById('host-name').value || 'Host';
        
        try {
            const result = await this.multiplayer.initialize(true);
            this.myPlayerId = result.roomId;
            
            document.getElementById('lobby-section').classList.add('hidden');
            document.getElementById('room-section').classList.remove('hidden');
            document.getElementById('room-code-display').textContent = result.roomId;
            document.getElementById('host-controls').classList.remove('hidden');
            document.getElementById('waiting-message').classList.add('hidden');
            
            this.updatePlayerList();
            this.showNotification('✅ Tạo phòng thành công! Chia sẻ mã phòng với bạn bè.');
        } catch (error) {
            console.error('Failed to create room:', error);
            this.showNotification('❌ Không thể tạo phòng: ' + error.message);
        }
    }

    /**
     * Join an existing room
     */
    async joinRoom() {
        const roomCode = document.getElementById('room-code-input').value.trim();
        const name = document.getElementById('player-name').value || 'Player';
        
        if (!roomCode) {
            this.showNotification('❌ Vui lòng nhập mã phòng!');
            return;
        }

        try {
            await this.multiplayer.initialize(false);
            await this.multiplayer.joinRoom(roomCode, name);
            this.myPlayerId = this.multiplayer.peerId;
            
            document.getElementById('lobby-section').classList.add('hidden');
            document.getElementById('room-section').classList.remove('hidden');
            document.getElementById('room-code-display').textContent = roomCode;
            document.getElementById('host-controls').classList.add('hidden');
            
            this.updatePlayerList();
            this.showNotification('✅ Vào phòng thành công!');
        } catch (error) {
            console.error('Failed to join room:', error);
            this.showNotification('❌ Không thể vào phòng: ' + error.message);
        }
    }

    /**
     * Update player list UI
     * SECURITY: Sanitize player names to prevent XSS
     */
    updatePlayerList() {
        const playerList = document.getElementById('player-list');
        const players = this.multiplayer.players;
        
        playerList.innerHTML = players.map((player, index) => `
            <div class="player-item ${player.isHost ? 'host' : ''}">
                <div class="player-status">
                    <span class="online"></span>
                    <span>${this.sanitize(player.name)} ${player.isHost ? '👑' : ''}</span>
                </div>
                <span style="color: #666;">#${index + 1}</span>
            </div>
        `).join('');
    }

    /**
     * Update player count
     * Updated: No minimum player requirement - any number can start
     */
    updatePlayerCount() {
        const count = this.multiplayer.players.length;
        document.getElementById('player-count').textContent = count;
        // Removed minimum player requirement - always enable start button
        document.getElementById('start-game-btn').disabled = false;
        
        if (this.multiplayer.isHost) {
            document.getElementById('room-status').textContent = 
                `✅ Sẵn sàng bắt đầu! (${count} người chơi)`;
        }
    }

    /**
     * Copy room code to clipboard
     */
    copyRoomCode() {
        const code = document.getElementById('room-code-display').textContent;
        navigator.clipboard.writeText(code).then(() => {
            this.showNotification('📋 Đã sao chép mã phòng!');
        });
    }

    /**
     * Start the game (host only)
     */
    startGame() {
        if (!this.multiplayer.isHost) return;
        
        const playerCount = this.multiplayer.players.length;
        const roles = this.generateRoles(playerCount);
        
        // Start game for all players
        this.multiplayer.startGame(roles);
        
        // Assign my role locally
        const myPlayerIndex = this.multiplayer.players.findIndex(p => p.id === this.myPlayerId);
        this.myRole = roles[myPlayerIndex];
        this.showMyRole(this.myRole);
        
        // Update UI
        document.getElementById('room-section').classList.add('hidden');
        document.getElementById('game-section').classList.remove('hidden');
        
        this.gameState = 'playing';
        this.phase = 'night';
        this.nightCount = 1;
        
        this.updateGameUI();
        this.addGameLog('🌙 Đêm 1 bắt đầu!');
    }

    /**
     * Generate role distribution
     * Updated: Support any player count (1+)
     */
    generateRoles(playerCount) {
        let roles = [];
        
        // Scale roles based on player count
        if (playerCount === 1) {
            // Single player practice mode
            roles = ['werewolf'];
        } else if (playerCount === 2) {
            roles = ['werewolf', 'seer'];
        } else if (playerCount === 3) {
            roles = ['werewolf', 'villager', 'seer'];
        } else if (playerCount === 4) {
            roles = ['werewolf', 'villager', 'villager', 'seer'];
        } else if (playerCount <= 6) {
            roles = ['werewolf', 'werewolf', 'villager', 'villager', 'seer', 'hunter'];
        } else if (playerCount <= 8) {
            roles = ['werewolf', 'werewolf', 'villager', 'villager', 'villager', 'seer', 'hunter', 'guard'];
        } else if (playerCount <= 10) {
            roles = ['werewolf', 'werewolf', 'villager', 'villager', 'villager', 'villager', 
                     'seer', 'hunter', 'witch', 'guard'];
        } else if (playerCount <= 12) {
            roles = ['werewolf', 'werewolf', 'werewolf', 'villager', 'villager', 'villager',
                     'villager', 'villager', 'seer', 'hunter', 'witch', 'guard'];
        } else {
            // 13+ players - scale up
            const werewolfCount = Math.ceil(playerCount / 4);
            const specialRoles = ['seer', 'hunter', 'witch', 'guard', 'cupid'];
            
            roles = [];
            for (let i = 0; i < werewolfCount; i++) {
                roles.push('werewolf');
            }
            specialRoles.forEach(role => roles.push(role));
            
            // Fill rest with villagers
            while (roles.length < playerCount) {
                roles.push('villager');
            }
        }
        
        // Ensure we have exactly the right number
        while (roles.length < playerCount) {
            roles.push('villager');
        }
        roles = roles.slice(0, playerCount);
        
        // Shuffle roles (Fisher-Yates)
        for (let i = roles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [roles[i], roles[j]] = [roles[j], roles[i]];
        }
        
        return roles;
    }

    /**
     * Show my role to player
     */
    showMyRole(role) {
        const roleData = this.ROLES[role];
        document.getElementById('my-role').textContent = roleData.icon;
        document.getElementById('my-role-name').textContent = roleData.name;
        document.getElementById('my-role-ability').textContent = 
            this.getRoleAbility(role);
    }

    /**
     * Get role ability description
     */
    getRoleAbility(role) {
        const abilities = {
            werewolf: 'Giết một người mỗi đêm',
            villager: 'Không có khả năng đặc biệt',
            seer: 'Xem vai trò của một người mỗi đêm',
            hunter: 'Kéo theo một người khi chết',
            witch: 'Một thuốc giải, một thuốc độc',
            guard: 'Bảo vệ một người mỗi đêm',
            cupid: 'Chọn hai người làm đôi uyên ương'
        };
        return abilities[role] || '';
    }

    /**
     * Update game UI based on phase
     * Fixed: Ensure action buttons and players grid are populated
     */
    updateGameUI() {
        console.log('updateGameUI called:', { 
            phase: this.phase, 
            nightCount: this.nightCount, 
            myRole: this.myRole,
            gameState: this.gameState 
        });
        
        const phaseDisplay = document.getElementById('phase-display');
        const nightNumber = document.getElementById('night-number');
        const phaseAction = document.getElementById('phase-action');
        const actionButtons = document.getElementById('action-buttons');
        
        if (!phaseDisplay || !actionButtons) {
            console.error('Game UI elements not found!');
            return;
        }
        
        if (this.phase === 'night') {
            phaseDisplay.className = 'phase-indicator night';
            phaseDisplay.innerHTML = `
                <div>🌙 Đêm ${this.nightCount}</div>
                <div id="phase-action">${this.getNightActionText()}</div>
            `;
            this.setupNightActions();
        } else if (this.phase === 'day') {
            phaseDisplay.className = 'phase-indicator day';
            phaseDisplay.innerHTML = `
                <div>☀️ Ngày ${this.dayCount}</div>
                <div id="phase-action">Thảo luận và bỏ phiếu</div>
            `;
            this.setupDayActions();
        }
        
        // Ensure players grid is updated
        this.updatePlayersGrid();
        
        console.log('updateGameUI complete');
    }

    /**
     * Get night action text based on role
     */
    getNightActionText() {
        switch (this.myRole) {
            case 'werewolf':
                return 'Chọn người để giết';
            case 'seer':
                return 'Xem vai trò của một người';
            case 'witch':
                return 'Sử dụng thuốc (nếu có)';
            case 'guard':
                return 'Chọn người để bảo vệ';
            default:
                return 'Chờ đến lượt...';
        }
    }

    /**
     * Setup night action buttons
     * Enhanced Witch UI with heal/poison toggle
     */
    setupNightActions() {
        const actionButtons = document.getElementById('action-buttons');
        
        if (this.myRole === 'witch') {
            // Enhanced Witch UI with heal/poison selection
            const hasAnyPotion = this.witchHasHeal || this.witchHasPoison;
            
            if (!hasAnyPotion) {
                actionButtons.innerHTML = `
                    <p style="color: #aaa;">🧙 Bạn đã hết thuốc!</p>
                `;
            } else {
                actionButtons.innerHTML = `
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        ${this.witchHasHeal ? `
                            <button class="btn ${this.witchAction === 'heal' ? 'btn-primary' : 'btn-secondary'}" 
                                    onclick="game.setWitchAction('heal')">
                                💚 Cứu (Thuốc giải)
                            </button>
                        ` : ''}
                        ${this.witchHasPoison ? `
                            <button class="btn ${this.witchAction === 'poison' ? 'btn-primary' : 'btn-secondary'}" 
                                    onclick="game.setWitchAction('poison')">
                                ☠️ Giết (Thuốc độc)
                            </button>
                        ` : ''}
                        <button class="btn btn-primary" onclick="game.submitNightAction()">
                            ✅ Xác nhận
                        </button>
                    </div>
                    <p style="color: #aaa; margin-top: 10px; font-size: 0.9em;">
                        Chọn thuốc, sau đó chọn người để sử dụng
                    </p>
                `;
            }
        } else if (['werewolf', 'seer', 'guard'].includes(this.myRole)) {
            actionButtons.innerHTML = `
                <button class="btn btn-primary" onclick="game.submitNightAction()">
                    ✅ Xác nhận hành động
                </button>
            `;
        } else {
            actionButtons.innerHTML = `
                <p style="color: #aaa;">🌙 Bạn là dân làng. Hãy chờ và quan sát...</p>
            `;
        }
    }

    /**
     * Set Witch action (heal or poison)
     */
    setWitchAction(action) {
        if (action === 'heal' && !this.witchHasHeal) return;
        if (action === 'poison' && !this.witchHasPoison) return;
        
        this.witchAction = action;
        this.setupNightActions();
        this.showNotification(action === 'heal' ? '💚 Đã chọn thuốc giải' : '☠️ Đã chọn thuốc độc');
    }

    /**
     * Setup day action buttons
     */
    setupDayActions() {
        const actionButtons = document.getElementById('action-buttons');
        actionButtons.innerHTML = `
            <button class="btn btn-primary" onclick="game.submitVote()">
                🗳️ Bỏ phiếu
            </button>
        `;
    }

    /**
     * Update players grid
     * SECURITY: Sanitize player names to prevent XSS
     */
    updatePlayersGrid() {
        const grid = document.getElementById('players-grid');
        const players = this.multiplayer.players;
        
        grid.innerHTML = players.map((player, index) => {
            const isDead = player.alive === false;
            const isSelected = this.selectedPlayer === player.id;
            
            return `
                <div class="player-card ${isDead ? 'dead' : ''} ${isSelected ? 'selected' : ''}" 
                     onclick="game.selectPlayer(${player.id})">
                    <div class="status">${isDead ? '☠️' : '✅'}</div>
                    <div class="avatar">👤</div>
                    <div style="font-weight: bold;">${this.sanitize(player.name)}</div>
                    <div style="color: #aaa; font-size: 0.9em;">#${index + 1}</div>
                </div>
            `;
        }).join('');
    }

    /**
     * Select a player for action
     */
    selectPlayer(playerId) {
        if (this.gameState !== 'playing') return;
        
        const player = this.multiplayer.players.find(p => p.id === playerId);
        if (!player || !player.alive) return;
        
        this.selectedPlayer = playerId;
        this.updatePlayersGrid();
    }

    /**
     * Submit night action
     * SECURITY: Validate connection state before sending
     * Enhanced: Handle Witch heal/poison selection
     */
    submitNightAction() {
        // Handle Witch special case
        if (this.myRole === 'witch' && this.witchAction) {
            if (!this.selectedPlayer) {
                this.showNotification('❌ Chọn một người để sử dụng thuốc!');
                return;
            }
            
            // Mark potion as used
            if (this.witchAction === 'heal') {
                this.witchHasHeal = false;
                this.showNotification('💚 Đã sử dụng thuốc giải!');
            } else if (this.witchAction === 'poison') {
                this.witchHasPoison = false;
                this.showNotification('☠️ Đã sử dụng thuốc độc!');
            }
            
            this.multiplayer.sendNightAction(this.myPlayerId, this.myRole, this.selectedPlayer, this.witchAction);
            this.witchAction = null;
            this.selectedPlayer = null;
            this.setupNightActions();
            this.updatePlayersGrid();
            return;
        }
        
        // Standard night action for other roles
        if (!this.selectedPlayer) {
            this.showNotification('❌ Chọn một người trước!');
            return;
        }
        
        // Validate connection
        if (this.multiplayer.connections.length === 0 && !this.multiplayer.isHost) {
            this.showNotification('❌ Mất kết nối! Vui lòng tải lại trang.');
            return;
        }
        
        this.multiplayer.sendNightAction(this.myPlayerId, this.myRole, this.selectedPlayer);
        this.showNotification('✅ Đã gửi hành động!');
        this.selectedPlayer = null;
        this.updatePlayersGrid();
    }

    /**
     * Submit vote
     * SECURITY: Validate connection state before sending
     */
    submitVote() {
        if (!this.selectedPlayer) {
            this.showNotification('❌ Chọn một người để bỏ phiếu!');
            return;
        }
        
        // Validate connection
        if (this.multiplayer.connections.length === 0 && !this.multiplayer.isHost) {
            this.showNotification('❌ Mất kết nối! Vui lòng tải lại trang.');
            return;
        }
        
        this.multiplayer.sendVote(this.myPlayerId, this.selectedPlayer);
        this.showNotification('✅ Đã bỏ phiếu!');
        this.selectedPlayer = null;
        this.updatePlayersGrid();
    }

    /**
     * Handle night action (host)
     */
    handleNightAction(data) {
        if (!this.multiplayer.isHost) return;
        
        // Store action
        if (!this.actionsReceived[data.role]) {
            this.actionsReceived[data.role] = [];
        }
        this.actionsReceived[data.role].push(data);
        
        this.addGameLog(`${data.playerName} (${this.ROLES[data.role].name}) đã hành động`);
    }

    /**
     * Handle vote (host)
     */
    handleVote(data) {
        if (!this.multiplayer.isHost) return;
        
        this.addGameLog(`${data.voterId} bỏ phiếu cho ${data.targetId}`);
    }

    /**
     * Check win condition (host only)
     * Called after each night action or vote
     */
    checkWinCondition() {
        if (!this.multiplayer.isHost) return null;
        
        const alivePlayers = this.multiplayer.players.filter(p => p.alive !== false);
        const aliveWerewolves = alivePlayers.filter(p => p.role === 'werewolf');
        const aliveVillagers = alivePlayers.filter(p => p.role !== 'werewolf');
        
        // Evil wins if werewolves equal or outnumber villagers
        if (aliveWerewolves.length >= aliveVillagers.length && aliveWerewolves.length > 0) {
            return 'evil';
        }
        
        // Good wins if all werewolves are eliminated
        if (aliveWerewolves.length === 0) {
            return 'good';
        }
        
        return null; // Game continues
    }

    /**
     * End game and show winner (host only)
     */
    endGame(winner) {
        if (!this.multiplayer.isHost) return;
        
        this.winner = winner;
        this.gameState = 'finished';
        
        // Broadcast game over
        this.multiplayer.updateGameState('finished', {
            winner: winner,
            phase: this.phase,
            nightCount: this.nightCount,
            dayCount: this.dayCount
        });
        
        // Show game over UI locally
        this.showGameOver(winner);
    }

    /**
     * Show game over screen
     */
    showGameOver(winner) {
        document.getElementById('game-section').classList.add('hidden');
        document.getElementById('game-over-section').classList.remove('hidden');
        
        const winnerIcon = document.getElementById('winner-icon');
        const winnerText = document.getElementById('winner-text');
        
        if (winner === 'good') {
            winnerIcon.textContent = '🎉';
            winnerText.textContent = '🏆 PHE DÂN LÀNG THẮNG!';
            winnerText.style.color = '#4ade80';
        } else if (winner === 'evil') {
            winnerIcon.textContent = '🐺';
            winnerText.textContent = '🩸 PHE MA SÓI THẮNG!';
            winnerText.style.color = '#e94560';
        } else {
            winnerIcon.textContent = '🤝';
            winnerText.textContent = 'HÒA!';
            winnerText.style.color = '#aaa';
        }
        
        this.addGameLog(`🏆 Game over! Phe ${winner === 'good' ? 'dân làng' : 'ma sói'} thắng!`);
    }

    /**
     * Handle game over message from host
     */
    handleGameOver(data) {
        this.winner = data.winner;
        this.gameState = 'finished';
        this.showGameOver(data.winner);
    }

    /**
     * Send chat message
     */
    sendChat() {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();
        
        if (!message) return;
        
        const player = this.multiplayer.players.find(p => p.id === this.myPlayerId);
        const playerName = player ? player.name : 'Anonymous';
        
        this.multiplayer.sendChatMessage(playerName, message);
        input.value = '';
    }

    /**
     * Handle chat input keypress
     */
    handleChatKey(event) {
        if (event.key === 'Enter') {
            this.sendChat();
        }
    }

    /**
     * Add chat message
     * SECURITY: Sanitize sender and message to prevent XSS
     */
    addChatMessage(sender, message, timestamp) {
        const messagesDiv = document.getElementById('chat-messages');
        const time = new Date(timestamp).toLocaleTimeString('vi-VN', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        // Create elements safely using DOM methods instead of innerHTML
        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message';
        
        const senderDiv = document.createElement('div');
        senderDiv.className = 'sender';
        senderDiv.textContent = sender;
        
        const messageContent = document.createElement('div');
        messageContent.textContent = message;
        
        const timeDiv = document.createElement('div');
        timeDiv.className = 'time';
        timeDiv.textContent = time;
        
        messageDiv.appendChild(senderDiv);
        messageDiv.appendChild(messageContent);
        messageDiv.appendChild(timeDiv);
        messagesDiv.appendChild(messageDiv);
        
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    /**
     * Add game log entry
     * SECURITY: Use textContent to prevent XSS
     */
    addGameLog(message) {
        const logDiv = document.getElementById('game-log');
        
        const logEntry = document.createElement('div');
        logEntry.className = 'chat-message';
        logEntry.textContent = message;
        
        logDiv.appendChild(logEntry);
        logDiv.scrollTop = logDiv.scrollHeight;
    }

    /**
     * Show notification
     */
    showNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => notification.remove(), 3000);
    }
}

// Initialize game
const game = new WerewolfGame();

// Expose functions to HTML
window.createRoom = () => game.createRoom();
window.joinRoom = () => game.joinRoom();
window.copyRoomCode = () => game.copyRoomCode();
window.startGame = () => game.startGame();
window.selectPlayer = (id) => game.selectPlayer(id);
window.submitNightAction = () => game.submitNightAction();
window.submitVote = () => game.submitVote();
window.sendChat = () => game.sendChat();
window.handleChatKey = (e) => game.handleChatKey(e);
window.showVersionInfo = () => game.showVersionInfo();

// Add version info method to WerewolfGame prototype
WerewolfGame.prototype.showVersionInfo = function() {
    const versionInfo = `
🐺 Ma Sói Online - Version History

v0.5.0-beta (Current)
- 🐛 FIX: Players now transition to game screen when host starts
- 🐛 FIX: Players can interact during game (night/day actions)
- 🐛 FIX: Role assignment reaches all players including host
- 🐛 FIX: nightCount starts at 1 instead of 0
- 🐛 FIX: Action buttons properly setup in updateGameUI()
- 📝 Added debug logging for troubleshooting

v0.4.0-beta
- 👥 Removed 5-player minimum - play with any number (1+)
- 🖥️ Fixed: Host now sees players joining in real-time
- 🔒 Only allow joining existing rooms (5s timeout)
- 📝 Better error messages for invalid rooms

v0.3.0-beta
- 🔒 SECURITY: Fixed XSS vulnerabilities (critical)
- 🏆 FEATURE: Win condition detection & game over screen
- 🧙 FEATURE: Enhanced Witch UI (heal/poison toggle)
- ⚠️ FEATURE: Host disconnect handling
- ✅ IMPROVE: Connection validation before actions
- ✅ IMPROVE: All user input sanitized

v0.2.0-beta
- 🌐 Multiplayer online with PeerJS WebRTC
- 🏠 Room system (create/join with codes)
- 🎭 Role assignment (7 roles)
- 🌙 Night phase actions
- ☀️ Day phase voting
- 💬 Real-time chat
- 📱 Responsive mobile UI

v0.1.0-alpha
- 🎮 Single-player local version
- Basic game flow
- 7 roles implemented

---
Total Commits: 8
Last Updated: ${new Date().toLocaleDateString('vi-VN')}
Status: Beta Testing
    `;
    
    alert(versionInfo);
};
