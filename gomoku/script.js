document.addEventListener('DOMContentLoaded', () => {
    audioManager.load('move', '../piece_sound.mp3');
    // --- DOM Element Selection ---
    const modeSelectionView = document.getElementById('mode-selection-view');
    const gameView = document.getElementById('game-view');

    const pveButton = document.querySelector('.mode-button[data-mode="pve"]');
    const pvpButton = document.querySelector('.mode-button[data-mode="pvp"]');
    const onlineButton = document.querySelector('.mode-button[data-mode="online"]');
    const onlineOptions = document.getElementById('online-options');
    const roomIdInput = document.getElementById('room-id');
    const createRoomBtn = document.getElementById('create-room-btn');
    const joinRoomBtn = document.getElementById('join-room-btn');
    const onlineStatus = document.getElementById('online-status');

    const canvas = document.getElementById('chessboard');
    const ctx = canvas.getContext('2d');
    const resetButton = document.getElementById('reset-button');
    const undoButton = document.getElementById('undo-button');
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    const backBtn = document.getElementById('back-btn');
    const currentPlayerSpan = document.getElementById('current-player');
    const statusMessageP = document.getElementById('status-message');

    // --- Game Constants ---
    const BOARD_SIZE = 15;
    const PIECE_RADIUS_RATIO = 0.45; // Piece radius as a ratio of grid size

    // --- Game State ---
    let board = [];
    let moveHistory = [];
    let currentPlayer = 1; // 1: black, 2: white
    let isGameOver = false;
    let gameMode = null; // 'pve', 'pvp', 'online'
    let lastMove = null;
    
    // --- Online State ---
    let isWaitingForReconnect = false;
    let reconnectionTimer = null;
    let reconnectionCountdownInterval = null;
    let peer = null;
    let conn = null;
    let playerColor = 1; // 1 for host (black), 2 for joiner (white)

    let inactivityTimer = null;

    // --- View Management ---
    function showGameView() {
        modeSelectionView.classList.add('hidden');
        gameView.classList.remove('hidden');
        resizeCanvas();
        resetInactivityTimer();
        window.addEventListener('mousemove', resetInactivityTimer);
        window.addEventListener('keydown', resetInactivityTimer);
    }

    function showModeSelectionView() {
        gameView.classList.add('hidden');
        modeSelectionView.classList.remove('hidden');

        // Stop inactivity timer
        if (inactivityTimer) {
            clearTimeout(inactivityTimer);
            inactivityTimer = null;
        }
        window.removeEventListener('mousemove', resetInactivityTimer);
        window.removeEventListener('keydown', resetInactivityTimer);

        clearTimeout(reconnectionTimer);
        clearInterval(reconnectionCountdownInterval);
        isWaitingForReconnect = false;

        if (peer) {
            peer.destroy();
            peer = null;
        }
        onlineStatus.textContent = '';
        onlineOptions.classList.add('hidden');
        joinRoomBtn.textContent = '加入房间';
    }

    // --- Game Initialization ---
    function startGame(mode) {
        gameMode = mode;
        if (gameMode === 'online') {
            initOnlineMode();
        } else {
            initGame();
            showGameView();
        }
    }

    function initGame() {
        board = Array(BOARD_SIZE).fill(0).map(() => Array(BOARD_SIZE).fill(0));
        moveHistory = [];
        currentPlayer = 1;
        isGameOver = false;
        lastMove = null;
        updateGameInfo();
        statusMessageP.textContent = '';
        drawBoard();
    }

    // --- Drawing ---
    function resizeCanvas() {
        const container = document.getElementById('board-container');
        const size = container.clientWidth;
        canvas.width = size;
        canvas.height = size;
        drawBoard();
    }

    function drawBoard() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#e9c088';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        const gridSize = canvas.width / (BOARD_SIZE + 1);
        const padding = gridSize;
        
        ctx.strokeStyle = '#5a3a1a';
        ctx.lineWidth = 1;

        for (let i = 0; i < BOARD_SIZE; i++) {
            const pos = padding + i * gridSize;
            // Vertical lines
            ctx.beginPath();
            ctx.moveTo(pos, padding);
            ctx.lineTo(pos, canvas.width - padding);
            ctx.stroke();
            // Horizontal lines
            ctx.beginPath();
            ctx.moveTo(padding, pos);
            ctx.lineTo(canvas.width - padding, pos);
            ctx.stroke();
        }
        
        const starPoints = [3, 7, 11];
        ctx.fillStyle = '#5a3a1a';
        starPoints.forEach(x => {
            starPoints.forEach(y => {
                const starX = padding + x * gridSize;
                const starY = padding + y * gridSize;
                ctx.beginPath();
                ctx.arc(starX, starY, 4, 0, 2 * Math.PI);
                ctx.fill();
            });
        });

        drawPieces();
    }

    function drawPieces() {
        for (let y = 0; y < BOARD_SIZE; y++) {
            for (let x = 0; x < BOARD_SIZE; x++) {
                if (board[y][x] !== 0) {
                    drawPiece(x, y, board[y][x]);
                }
            }
        }
        if (lastMove) {
            highlightLastMove(lastMove.x, lastMove.y);
        }
    }

    function drawPiece(x, y, player) {
        const gridSize = canvas.width / (BOARD_SIZE + 1);
        const padding = gridSize;
        const canvasX = padding + x * gridSize;
        const canvasY = padding + y * gridSize;
        const pieceRadius = gridSize * PIECE_RADIUS_RATIO;
        
        ctx.beginPath();
        ctx.arc(canvasX, canvasY, pieceRadius, 0, 2 * Math.PI);
        
        const gradient = ctx.createRadialGradient(canvasX - 5, canvasY - 5, 2, canvasX, canvasY, pieceRadius);
        if (player === 1) { // Black piece
            gradient.addColorStop(0, '#666');
            gradient.addColorStop(1, '#000');
            ctx.fillStyle = gradient;
        } else { // White piece
            gradient.addColorStop(0, '#fff');
            gradient.addColorStop(1, '#ddd');
            ctx.fillStyle = gradient;
            ctx.strokeStyle = '#bbb';
            ctx.lineWidth = 1;
        }
        ctx.fill();
        if (player === 2) ctx.stroke();
    }

    function highlightLastMove(x, y) {
        const gridSize = canvas.width / (BOARD_SIZE + 1);
        const padding = gridSize;
        const canvasX = padding + x * gridSize;
        const canvasY = padding + y * gridSize;
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(canvasX - 5, canvasY - 5);
        ctx.lineTo(canvasX + 5, canvasY + 5);
        ctx.moveTo(canvasX + 5, canvasY - 5);
        ctx.lineTo(canvasX - 5, canvasY + 5);
        ctx.stroke();
    }

    function updateGameInfo() {
        currentPlayerSpan.textContent = currentPlayer === 1 ? '黑子' : '白子';
        currentPlayerSpan.style.color = currentPlayer === 1 ? 'black' : '#555';
        if (gameMode === 'online') {
            statusMessageP.textContent = (currentPlayer === playerColor) ? '轮到你走棋' : '等待对手走棋...';
        } else if (gameMode === 'pve') {
             statusMessageP.textContent = (currentPlayer === 1) ? '轮到你走棋' : 'AI思考中...';
        }
    }

    // --- Game Logic ---
    function handleBoardClick(event) {
        if (isGameOver) return;
        if (gameMode === 'pve' && currentPlayer === 2) return;
        if (gameMode === 'online' && currentPlayer !== playerColor) return;
        
        resetInactivityTimer();

        const rect = canvas.getBoundingClientRect();
        const gridSize = canvas.width / (BOARD_SIZE + 1);
        const padding = gridSize;
        
        const clickX = (event.clientX - rect.left) / rect.width * canvas.width;
        const clickY = (event.clientY - rect.top) / rect.height * canvas.height;
        
        const x = Math.round((clickX - padding) / gridSize);
        const y = Math.round((clickY - padding) / gridSize);

        if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE || board[y][x] !== 0) return;

        const move = { x, y, player: currentPlayer };
        if (executeMove(move)) {
            if (gameMode === 'online' && conn) {
                conn.send({ type: 'move', move });
            } else if (gameMode === 'pve' && !isGameOver) {
                setTimeout(makeAIMove, 250);
            }
        }
    }

    function executeMove(move) {
        const { x, y, player } = move;
        if (board[y][x] !== 0) return false;
        
        board[y][x] = player;
        moveHistory.push(move);
        lastMove = { x, y };
        audioManager.play('move');
        drawBoard();

        if (checkWin(x, y)) {
            isGameOver = true;
            statusMessageP.textContent = `${player === 1 ? '黑方' : '白方'} 胜利!`;
        } else {
            currentPlayer = (player === 1) ? 2 : 1;
            updateGameInfo();
        }
        return true;
    }
    
    function checkWin(x, y) {
        const p = board[y][x];
        if (!p) return false;
        const directions = [[1,0], [0,1], [1,1], [1,-1]];
        for (const [dx, dy] of directions) {
            let count = 1;
            for (let i = 1; i < 5; i++) {
                const nx = x + i * dx, ny = y + i * dy;
                if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && board[ny][nx] === p) count++; else break;
            }
            for (let i = 1; i < 5; i++) {
                const nx = x - i * dx, ny = y - i * dy;
                if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && board[ny][nx] === p) count++; else break;
            }
            if (count >= 5) return true;
        }
        return false;
    }
    
    function undoMove() {
        if (isGameOver) isGameOver = false;
        const steps = (gameMode === 'pve' && moveHistory.length > 1) ? 2 : 1;
        if (moveHistory.length < steps) return;

        for (let i = 0; i < steps; i++) {
            const last = moveHistory.pop();
            if (last) {
                board[last.y][last.x] = 0;
                currentPlayer = last.player;
            }
        }
        lastMove = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1] : null;
        updateGameInfo();
        drawBoard();
        statusMessageP.textContent = '';
    }

    // --- Inactivity Timer ---
    function resetInactivityTimer() {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(kickPlayerForInactivity, 5 * 60 * 1000); // 5 minutes
    }

    function kickPlayerForInactivity() {
        if (gameView.classList.contains('hidden')) return;
        alert('您因长时间未操作，已自动断开连接。');
        showModeSelectionView();
    }

    // --- Online Logic ---
    function initOnlineMode() {
        if (peer && peer.open) return;
        onlineStatus.textContent = '正在连接服务器...';
        
        const peerId = 'gomoku-h5-' + Math.random().toString(36).substr(2, 9);
        peer = new Peer(peerId, { host: 'peerjs.92k.de', path: '/', secure: true, debug: 2 });

        peer.on('open', (id) => { 
            onlineStatus.textContent = `我的ID: ${id}`; 
            createRoomBtn.disabled = false;
            joinRoomBtn.disabled = false;
        });
        peer.on('connection', (c) => { 
            if (isWaitingForReconnect) {
                clearInterval(reconnectionCountdownInterval);
                clearTimeout(reconnectionTimer);
                isWaitingForReconnect = false;
                conn = c;
                onlineStatus.textContent = '对手已重新连接！';
                setupConnectionEvents();
            } else {
                conn = c; 
                onlineStatus.textContent = '有玩家正在连接...';
                setupConnectionEvents(); 
            }
        });
        peer.on('error', (err) => { 
            console.error('PeerJS error:', err); 
            onlineStatus.textContent = `连接错误: ${err.type}.`; 
        });
    }

    function createRoom() {
        playerColor = 1; // Host is black
        localStorage.removeItem('gomoku_last_game_id');
        if (peer && peer.id) {
            onlineStatus.textContent = `房间已创建, 等待好友加入... (ID: ${peer.id})`;
        } else {
            onlineStatus.textContent = `房间创建中...请稍候`;
        }
    }

    function joinRoom() {
        const remoteId = roomIdInput.value.trim();
        if (!remoteId || !peer) return;
        
        localStorage.setItem('gomoku_last_game_id', remoteId);
        onlineStatus.textContent = `正在连接到 ${remoteId}...`;
        conn = peer.connect(remoteId, { reliable: true });

        conn.on('open', () => {
            playerColor = 2; // Joiner is white
            onlineStatus.textContent = `连接成功! 等待同步...`;
            conn.send({type: 'sync_request'});
        });
        
        setupConnectionEvents();
    }

    function setupConnectionEvents() {
        if (!conn) return;
        conn.on('data', (data) => {
            switch (data.type) {
                case 'sync_request':
                    if (playerColor === 1) { // Host
                        initGame(); 
                        conn.send({
                            type: 'sync_response',
                            board: board,
                            moveHistory: moveHistory,
                            currentPlayer: currentPlayer
                        });
                        onlineStatus.textContent = '玩家已连接. 您是黑方，请走棋.';
                        showGameView();
                    }
                    break;
                case 'sync_response': // Joiner
                    board = data.board;
                    moveHistory = data.moveHistory;
                    currentPlayer = data.currentPlayer;
                    lastMove = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1] : null;
                    isGameOver = false;

                    if (playerColor === 2) { // Joiner just connected
                        localStorage.setItem('gomoku_last_game_id', conn.peer);
                    }

                    updateGameInfo();
                    onlineStatus.textContent = `同步成功! 您是白方.`;
                    showGameView();
                    break;
                case 'move':
                    executeMove(data.move);
                    break;
                case 'reset_request':
                    if (confirm('对手请求重新开始，是否同意?')) {
                        conn.send({ type: 'reset_accept' });
                        initGame();
                    }
                    break;
                case 'reset_accept':
                    initGame();
                    statusMessageP.textContent = '对手同意了重开游戏.';
                    break;
            }
        });
        conn.on('close', () => { 
            if (playerColor === 1 && gameMode === 'online') { // Host behavior
                isWaitingForReconnect = true;
                conn = null;

                let countdown = 60;
                onlineStatus.textContent = `对手已断开. 等待重连... ${countdown}s`;

                reconnectionCountdownInterval = setInterval(() => {
                    countdown--;
                    onlineStatus.textContent = `对手已断开. 等待重连... ${countdown}s`;
                    if (countdown <= 0) {
                        clearInterval(reconnectionCountdownInterval);
                    }
                }, 1000);

                reconnectionTimer = setTimeout(() => {
                    if (isWaitingForReconnect) {
                        alert('对手重连超时，游戏结束。');
                        isWaitingForReconnect = false;
                        showModeSelectionView();
                    }
                }, 60000);
            } else { // Joiner behavior
                alert('与房主的连接已断开，游戏结束。');
                showModeSelectionView();
            }
        });
    }
    
    // --- Event Listeners ---
    pveButton.addEventListener('click', () => {
        localStorage.removeItem('gomoku_last_game_id');
        startGame('pve');
    });
    pvpButton.addEventListener('click', () => {
        localStorage.removeItem('gomoku_last_game_id');
        startGame('pvp');
    });
    onlineButton.addEventListener('click', () => {
        onlineOptions.classList.toggle('hidden');
        if (!peer) startGame('online');
    });
    createRoomBtn.addEventListener('click', createRoom);
    joinRoomBtn.addEventListener('click', joinRoom);

    canvas.addEventListener('click', handleBoardClick);
    window.addEventListener('resize', resizeCanvas);
    
    resetButton.addEventListener('click', initGame);
    undoButton.addEventListener('click', () => {
        if (gameMode === 'online') {
            statusMessageP.textContent = '联机模式不支持悔棋。';
            setTimeout(() => {
                if (statusMessageP.textContent === '联机模式不支持悔棋。') {
                    statusMessageP.textContent = '';
                }
            }, 2000);
            return; // Explicitly stop execution for online mode
        }
        undoMove();
    });
    
    fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().then(() => fullscreenBtn.textContent = '退出全屏');
        } else {
            document.exitFullscreen().then(() => fullscreenBtn.textContent = '全屏');
        }
    });
    backBtn.addEventListener('click', showModeSelectionView);
    
    // --- AI Logic ---
    function makeAIMove() {
        if (isGameOver) return;
        let bestScore = -Infinity;
        let bestMove = null;
        for (let y = 0; y < BOARD_SIZE; y++) {
            for (let x = 0; x < BOARD_SIZE; x++) {
                if (board[y][x] === 0) {
                    let score = calculateScore(x, y, 2) + calculateScore(x, y, 1);
                    if (score > bestScore) {
                        bestScore = score;
                        bestMove = { x, y };
                    }
                }
            }
        }
        if (bestMove) {
            executeMove({ ...bestMove, player: 2 });
        }
    }

    function calculateScore(x, y, player) {
        let score = 0;
        const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
        for (const [dx, dy] of directions) {
            let count = 1;
            let openEnds = 0;
            let line = [{x, y}];
            for (let i = 1; i < 5; i++) {
                const nx = x + i * dx;
                const ny = y + i * dy;
                if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
                    if (board[ny][nx] === player) {
                        count++;
                        line.push({x: nx, y: ny});
                    } else if (board[ny][nx] === 0) {
                        openEnds++;
                        break;
                    } else {
                        break;
                    }
                }
            }
            for (let i = 1; i < 5; i++) {
                const nx = x - i * dx;
                const ny = y - i * dy;
                if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
                    if (board[ny][nx] === player) {
                        count++;
                        line.push({x: nx, y: ny});
                    } else if (board[ny][nx] === 0) {
                        openEnds++;
                        break;
                    } else {
                        break;
                    }
                }
            }

            if (count >= 5) return 100000;
            if (count === 4 && openEnds === 2) score += 50000;
            if (count === 4 && openEnds === 1) score += 1000;
            if (count === 3 && openEnds === 2) score += 500;
            if (count === 3 && openEnds === 1) score += 100;
            if (count === 2 && openEnds === 2) score += 50;
            if (count === 2 && openEnds === 1) score += 10;
            if (count === 1 && openEnds === 2) score += 1;
        }
        return score;
    }

    // --- Initial State ---
    const lastGameId = localStorage.getItem('gomoku_last_game_id');
    if (lastGameId) {
        roomIdInput.value = lastGameId;
        joinRoomBtn.textContent = '重连上一局';
    }
    showModeSelectionView();
});