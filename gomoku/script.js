document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('chessboard');
    const ctx = canvas.getContext('2d');
    const resetButton = document.getElementById('reset-button');
    const undoButton = document.getElementById('undo-button');
    const aiButton = document.getElementById('ai-button');
    const onlineButton = document.getElementById('online-button');
    const currentPlayerSpan = document.getElementById('current-player');
    const statusMessageP = document.getElementById('status-message');
    const onlineControls = document.getElementById('online-controls');
    const roomIdInput = document.getElementById('room-id');
    const createRoomButton = document.getElementById('create-room');
    const joinRoomButton = document.getElementById('join-room');
    const roomInfo = document.getElementById('room-info');

    // Game constants
    const BOARD_SIZE = 15;
    const GRID_SIZE = 40;
    const PIECE_RADIUS = 18;
    const CANVAS_PADDING = 20;
    const AI_DEPTH = 2; // AI search depth for a decent challenge

    // Game state
    let board = [];
    let moveHistory = [];
    let currentPlayer = 1; // 1: black, 2: white
    let isGameOver = false;
    let isAIMode = false;
    let isOnlineMode = false;
    let lastMove = null;
    
    // Online mode state
    let peer = null;
    let conn = null;
    let playerColor = 1; // In online mode, 1 for host (black), 2 for joiner (white)

    function initGame() {
        board = Array(BOARD_SIZE).fill(0).map(() => Array(BOARD_SIZE).fill(0));
        moveHistory = [];
        currentPlayer = 1;
        isGameOver = false;
        lastMove = null;
        updateGameInfo();
        statusMessageP.textContent = '';
        drawBoard();

        if (isAIMode && currentPlayer === 2) {
            // Should not happen on init, but as a safeguard
            setTimeout(makeAIMove, 500);
        }
    }

    function drawBoard() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#e9c088'; // Board color
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#5a3a1a';
        ctx.lineWidth = 1;

        for (let i = 0; i < BOARD_SIZE; i++) {
            ctx.beginPath();
            ctx.moveTo(CANVAS_PADDING + i * GRID_SIZE, CANVAS_PADDING);
            ctx.lineTo(CANVAS_PADDING + i * GRID_SIZE, CANVAS_PADDING + (BOARD_SIZE - 1) * GRID_SIZE);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(CANVAS_PADDING, CANVAS_PADDING + i * GRID_SIZE);
            ctx.lineTo(CANVAS_PADDING + (BOARD_SIZE - 1) * GRID_SIZE, CANVAS_PADDING + i * GRID_SIZE);
            ctx.stroke();
        }
        
        const starPoints = [{x: 3, y: 3}, {x: 11, y: 3}, {x: 3, y: 11}, {x: 11, y: 11}, {x: 7, y: 7}];
        ctx.fillStyle = '#5a3a1a';
        starPoints.forEach(p => {
            ctx.beginPath();
            ctx.arc(CANVAS_PADDING + p.x * GRID_SIZE, CANVAS_PADDING + p.y * GRID_SIZE, 4, 0, 2 * Math.PI);
            ctx.fill();
        });

        drawPieces();
    }

    function drawPieces() {
        const drawBoardPieces = () => {
            for (let y = 0; y < BOARD_SIZE; y++) {
                for (let x = 0; x < BOARD_SIZE; x++) {
                    if (board[y][x] !== 0) {
                        drawPiece(x, y, board[y][x]);
                    }
                }
            }
        };

        drawBoardPieces();
        if (lastMove) {
            highlightLastMove(lastMove.x, lastMove.y);
        }
    }

    function drawPiece(x, y, player) {
        const canvasX = CANVAS_PADDING + x * GRID_SIZE;
        const canvasY = CANVAS_PADDING + y * GRID_SIZE;
        
        ctx.beginPath();
        ctx.arc(canvasX, canvasY, PIECE_RADIUS, 0, 2 * Math.PI);
        
        const gradient = ctx.createRadialGradient(canvasX - 5, canvasY - 5, 2, canvasX, canvasY, PIECE_RADIUS);
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
        if(player === 2) ctx.stroke();
    }

    function highlightLastMove(x, y) {
        const canvasX = CANVAS_PADDING + x * GRID_SIZE;
        const canvasY = CANVAS_PADDING + y * GRID_SIZE;
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
        currentPlayerSpan.style.color = currentPlayer === 1 ? 'black' : '#333';
        if (isOnlineMode) {
            statusMessageP.textContent = (currentPlayer === playerColor) ? '轮到你走棋' : '等待对手走棋...';
        } else if (isAIMode) {
             statusMessageP.textContent = (currentPlayer === 1) ? '轮到你走棋' : 'AI思考中...';
        }
    }

    function handleBoardClick(event) {
        if (isGameOver || (isAIMode && currentPlayer === 2)) return;
        if (isOnlineMode && currentPlayer !== playerColor) return;
        
        const rect = canvas.getBoundingClientRect();
        const x = Math.round(((event.clientX - rect.left) * (canvas.width / rect.width) - CANVAS_PADDING) / GRID_SIZE);
        const y = Math.round(((event.clientY - rect.top) * (canvas.height / rect.height) - CANVAS_PADDING) / GRID_SIZE);

        if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE || board[y][x] !== 0) return;

        const move = { x, y, player: currentPlayer };
        if (executeMove(move)) {
            if (isOnlineMode && conn) {
                conn.send({ type: 'move', move });
            } else if (isAIMode && !isGameOver) {
                setTimeout(makeAIMove, 250); // Give a slight delay for better UX
            }
        }
    }

    function executeMove(move) {
        const { x, y, player } = move;
        if (board[y][x] !== 0) return false;
        
        board[y][x] = player;
        moveHistory.push(move);
        lastMove = { x, y };
        
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

        const steps = isAIMode ? 2 : 1;
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

    // --- AI LOGIC ---
    function makeAIMove() {
        if (isGameOver) return;

        const player = 2; // AI is player 2
        const opponent = 1;

        // 1. Check if AI can win in one move
        let winMove = findWinningMove(player);
        if (winMove) {
            executeMove({ ...winMove, player });
            return;
        }
        
        // 2. Check if opponent can win in one move, and block it
        let blockMove = findWinningMove(opponent);
        if (blockMove) {
            executeMove({ ...blockMove, player });
            return;
        }

        // 3. Use Minimax for the best strategic move
        const bestMove = findBestMove(player);
        if (bestMove) {
            executeMove({ ...bestMove, player });
        } else {
            // Fallback: if no move found (should not happen), play first available spot
            const fallbackMove = findFirstAvailableSpot();
            if(fallbackMove) executeMove({ ...fallbackMove, player });
        }
    }

    function findFirstAvailableSpot() {
        for (let y = 0; y < BOARD_SIZE; y++) {
            for (let x = 0; x < BOARD_SIZE; x++) {
                if (board[y][x] === 0) return {x, y};
            }
        }
        return null;
    }

    function findBestMove(player) {
        return minimaxRoot(AI_DEPTH, player);
    }

    function minimaxRoot(depth, player) {
        let bestMove = null;
        let bestValue = -Infinity;
        const moves = getPossibleMoves();

        for (const move of moves) {
            board[move.y][move.x] = player;
            const value = minimax(depth - 1, -Infinity, Infinity, false, player);
            board[move.y][move.x] = 0; // Revert
            if (value > bestValue) {
                bestValue = value;
                bestMove = move;
            }
        }
        return bestMove;
    }

    function minimax(depth, alpha, beta, isMaximizingPlayer, aiPlayer) {
        if (depth === 0) {
            return evaluateBoard(aiPlayer);
        }

        const moves = getPossibleMoves();
        const humanPlayer = aiPlayer === 1 ? 2 : 1;

        if (isMaximizingPlayer) {
            let maxValue = -Infinity;
            for (const move of moves) {
                board[move.y][move.x] = aiPlayer;
                const value = minimax(depth - 1, alpha, beta, false, aiPlayer);
                board[move.y][move.x] = 0;
                maxValue = Math.max(maxValue, value);
                alpha = Math.max(alpha, value);
                if (beta <= alpha) {
                    break;
                }
            }
            return maxValue;
        } else { // Minimizing player
            let minValue = Infinity;
            for (const move of moves) {
                board[move.y][move.x] = humanPlayer;
                const value = minimax(depth - 1, alpha, beta, true, aiPlayer);
                board[move.y][move.x] = 0;
                minValue = Math.min(minValue, value);
                beta = Math.min(beta, value);
                if (beta <= alpha) {
                    break;
                }
            }
            return minValue;
        }
    }

    function getPossibleMoves() {
        const moves = [];
        for (let y = 0; y < BOARD_SIZE; y++) {
            for (let x = 0; x < BOARD_SIZE; x++) {
                if (board[y][x] === 0) {
                    moves.push({ x, y });
                }
            }
        }
        return moves;
    }

    function evaluateBoard(player) {
        const opponent = player === 1 ? 2 : 1;
        const playerScore = evaluateAllLines(player);
        const opponentScore = evaluateAllLines(opponent);
        return playerScore - opponentScore;
    }

    function evaluateAllLines(player) {
        let totalScore = 0;
        
        // Rows
        for (let i = 0; i < BOARD_SIZE; i++) {
            totalScore += evaluateLine(board[i], player);
        }

        // Columns
        for (let i = 0; i < BOARD_SIZE; i++) {
            let col = board.map(row => row[i]);
            totalScore += evaluateLine(col, player);
        }

        // Diagonals (top-left to bottom-right)
        for (let i = 0; i < BOARD_SIZE * 2 - 1; i++) {
            let diag = [];
            for (let j = 0; j <= i; j++) {
                let x = j;
                let y = i - j;
                if (x < BOARD_SIZE && y < BOARD_SIZE) {
                    diag.push(board[y][x]);
                }
            }
            if(diag.length >= 5) totalScore += evaluateLine(diag, player);
        }

        // Diagonals (top-right to bottom-left)
        for (let i = 0; i < BOARD_SIZE * 2 - 1; i++) {
            let diag = [];
            for (let j = 0; j <= i; j++) {
                let x = (BOARD_SIZE - 1) - j;
                let y = i - j;
                if (x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE) {
                     diag.push(board[y][x]);
                }
            }
            if(diag.length >= 5) totalScore += evaluateLine(diag, player);
        }

        return totalScore;
    }

    function evaluateLine(line, player) {
        const lineStr = line.join('');
        const opponent = player === 1 ? 2 : 1;
        let score = 0;

        // Winning patterns (score is for player)
        if (lineStr.includes(String(player).repeat(5))) return 100000; // Win

        // Block opponent's win
        if (lineStr.includes(String(opponent).repeat(5))) return 50000;

        // Live four
        if (lineStr.includes('0' + String(player).repeat(4) + '0')) score += 10000;
        
        // Block opponent's live four
        if (lineStr.includes('0' + String(opponent).repeat(4) + '0')) score += 5000;

        // Dead four
        if (lineStr.includes(String(opponent) + String(player).repeat(4) + '0') || lineStr.includes('0' + String(player).repeat(4) + String(opponent))) score += 4000;

        // Live three
        if (lineStr.includes('0' + String(player).repeat(3) + '0')) score += 2000;
        
        // Block opponent's live three
        if (lineStr.includes('0' + String(opponent).repeat(3) + '0')) score += 1000;
        
        // Dead three
        const deadThreePattern1 = new RegExp(`0${player}{3}${opponent}`);
        const deadThreePattern2 = new RegExp(`${opponent}${player}{3}0`);
        if (deadThreePattern1.test(lineStr) || deadThreePattern2.test(lineStr)) {
            score += 500;
        }

        // Live two
        if (lineStr.includes('0' + String(player).repeat(2) + '0')) score += 200;

        // Dead two
        const deadTwoPattern1 = new RegExp(`0${player}{2}${opponent}`);
        const deadTwoPattern2 = new RegExp(`${opponent}${player}{2}0`);
        if (deadTwoPattern1.test(lineStr) || deadTwoPattern2.test(lineStr)) {
            score += 100;
        }

        return score;
    }

    function findWinningMove(player) {
        for (let y = 0; y < BOARD_SIZE; y++) {
            for (let x = 0; x < BOARD_SIZE; x++) {
                if (board[y][x] === 0) {
                    board[y][x] = player; // Try the move
                    if (checkWin(x, y)) {
                        board[y][x] = 0; // Revert
                        return { x, y };
                    }
                    board[y][x] = 0; // Revert
                }
            }
        }
        return null;
    }

    // --- ONLINE LOGIC ---
    function initOnlineMode() {
        if (peer && peer.open) return;
        isAIMode = false;
        isOnlineMode = true;
        onlineControls.style.display = 'block';
        roomInfo.textContent = '正在初始化...';
        
        const peerId = 'gomoku-' + Math.random().toString(16).slice(2);

        peer = new Peer(peerId, {
            // Using a public community PeerJS server
            host: 'peerjs.92k.de', 
            path: '/',
            secure: true,
            debug: 2,
            config: { 'iceServers': [{ urls: 'stun:stun.cloudflare.com:3478' }] }
        });
        
        peer.on('open', (id) => {
            roomInfo.textContent = `我的ID: ${id} (可分享给好友)`;
            createRoomButton.disabled = false;
            joinRoomButton.disabled = false;
        });
        peer.on('connection', (c) => {
            conn = c;
            roomInfo.textContent = '有玩家正在连接...';
            setupConnectionEvents();
        });
        peer.on('error', (err) => {
            console.error('PeerJS Error:', err);
            roomInfo.textContent = `连接错误: ${err.type}. 请刷新页面重试.`;
        });
    }
    
    function createRoom() {
        playerColor = 1;
        initGame();
        roomInfo.textContent = `房间已创建, 等待好友加入... (ID: ${peer.id})`;
    }
    
    function joinRoom() {
        const remoteId = roomIdInput.value.trim();
        if (!remoteId || !peer) return;
        
        roomInfo.textContent = `正在连接到 ${remoteId}...`;
        conn = peer.connect(remoteId);
        setupConnectionEvents();
    }
    
    function setupConnectionEvents() {
        if (!conn) return;
        conn.on('open', () => {
            if (!isOnlineMode) return; // a stale connection opened
            playerColor = 2; // The one who connects is player 2
            initGame();
            roomInfo.textContent = '连接成功! 您是白子.';
            conn.send({type: 'sync', msg: '连接成功! 您是黑子.'});
        });
        conn.on('data', (data) => {
            switch (data.type) {
                case 'sync':
                    roomInfo.textContent = data.msg;
                    break;
                case 'move':
                    executeMove(data.move);
                    break;
                case 'undo':
                    undoMoveForOpponent();
                    break;
                case 'reset':
                    initGame();
                    statusMessageP.textContent = '对手重开了游戏.';
                    break;
            }
        });
        conn.on('close', () => {
            roomInfo.textContent = '对手已断开连接.';
            conn = null;
        });
    }

    function undoMoveForOpponent() {
         const last = moveHistory.pop();
         if (last) {
            board[last.y][last.x] = 0;
            currentPlayer = last.player;
         }
         lastMove = moveHistory.length > 0 ? moveHistory[moveHistory.length-1] : null;
         updateGameInfo();
         drawBoard();
    }

    // Event listeners
    canvas.addEventListener('click', handleBoardClick);
    resetButton.addEventListener('click', () => {
        initGame();
        if (isOnlineMode && conn) conn.send({type: 'reset'});
    });
    undoButton.addEventListener('click', () => {
        if (isOnlineMode && conn) {
            // Online undo needs agreement, simplifying for now
            statusMessageP.textContent = '联机模式暂不支持悔棋';
        } else {
             undoMove();
        }
    });
    aiButton.addEventListener('click', () => {
        isAIMode = !isAIMode;
        if (isAIMode) {
            isOnlineMode = false;
            onlineControls.style.display = 'none';
        }
        initGame();
        aiButton.textContent = isAIMode ? '返回双人模式' : '人机对战';
    });
    onlineButton.addEventListener('click', initOnlineMode);
    createRoomButton.addEventListener('click', createRoom);
    joinRoomButton.addEventListener('click', joinRoom);
    initGame();
});