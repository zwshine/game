document.addEventListener('DOMContentLoaded', () => {
    // Views
    const modeSelectionView = document.getElementById('mode-selection-view');
    const gameView = document.getElementById('game-view');

    // Mode Selection Elements
    const pveButton = document.querySelector('.mode-button[data-mode="pve"]');
    const pvpButton = document.querySelector('.mode-button[data-mode="pvp"]');
    const onlineButton = document.querySelector('.mode-button[data-mode="online"]');
    const onlineOptions = document.getElementById('online-options');
    const roomIdInput = document.getElementById('room-id');
    const createRoomBtn = document.getElementById('create-room-btn');
    const joinRoomBtn = document.getElementById('join-room-btn');
    const onlineStatus = document.getElementById('online-status');

    // Game View Elements
    const canvas = document.getElementById('chessboard');
    const ctx = canvas.getContext('2d');
    const resetButton = document.getElementById('reset-button');
    const undoButton = document.getElementById('undo-button');
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    const backBtn = document.getElementById('back-btn');
    const currentPlayerSpan = document.getElementById('current-player');
    const statusMessageP = document.getElementById('status-message');
    
    const GRID_SIZE = 60;
    const BOARD_WIDTH = 9;
    const BOARD_HEIGHT = 10;
    const PIECE_RADIUS = 26;

    let board = [];
    let moveHistory = [];
    let lastMove = null;
    let currentPlayer = 'red';
    let selectedPiece = null;
    let isGameOver = false;
    let gameMode = null; // 'pve', 'pvp', 'online'
    
    // Online Play State
    let peer = null;
    let conn = null;
    let playerColor = 'red';

    const PIECE_TEXT = {
        1: '车', 2: '马', 3: '相', 4: '仕', 5: '帅', 6: '炮', 7: '兵',
        8: '車', 9: '馬', 10: '象', 11: '士', 12: '将', 13: '砲', 14: '卒'
    };
    
    function getPieceColor(piece) {
        if (piece === 0) return null;
        return piece >= 1 && piece <= 7 ? 'red' : 'black';
    }
    
    // --- View Management ---
    function showGameView() {
        modeSelectionView.classList.add('hidden');
        gameView.classList.remove('hidden');
        resizeCanvas();
    }

    function showModeSelectionView() {
        gameView.classList.add('hidden');
        modeSelectionView.classList.remove('hidden');
        if (peer) {
            peer.destroy();
            peer = null;
        }
        if (conn) {
            conn.close();
            conn = null;
        }
        onlineStatus.textContent = '';
        onlineOptions.classList.add('hidden');
    }

    // --- Game Initialization ---
    function startGame(mode) {
        gameMode = mode;
        isGameOver = false;
        if (gameMode === 'online') {
            playerColor = 'red'; // Host is red by default
            initOnlineMode();
        } else {
            initBoard();
            showGameView();
        }
    }
    
    function initBoard() {
        board = [
            [8, 9, 10, 11, 12, 11, 10, 9, 8],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 13, 0, 0, 0, 0, 0, 13, 0],
            [14, 0, 14, 0, 14, 0, 14, 0, 14],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [7, 0, 7, 0, 7, 0, 7, 0, 7],
            [0, 6, 0, 0, 0, 0, 0, 6, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [1, 2, 3, 4, 5, 4, 3, 2, 1]
        ];
        currentPlayer = 'red';
        selectedPiece = null;
        isGameOver = false;
        moveHistory = [];
        lastMove = null;
        
        updateGameInfo();
        drawBoard();
        drawPieces();
        
        if (gameMode === 'pve' && currentPlayer === 'black' && !isGameOver) {
            setTimeout(makeAIMove, 500);
        }
    }

    function drawBoard() {
        const gridW = canvas.width / BOARD_WIDTH;
        const gridH = canvas.height / BOARD_HEIGHT;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#e9c088'; // board color
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = '#333';
        
        const W = canvas.width * ((BOARD_WIDTH - 1) / BOARD_WIDTH);
        const H = canvas.height * ((BOARD_HEIGHT - 1) / BOARD_HEIGHT);
        const X_OFFSET = gridW / 2;
        const Y_OFFSET = gridH / 2;

        ctx.lineWidth = 2;
        // Draw outer rectangle
        ctx.strokeRect(X_OFFSET, Y_OFFSET, W, H);
        
        ctx.lineWidth = 1;
        // Draw horizontal lines
        for (let j = 1; j < BOARD_HEIGHT - 1; j++) {
            const y = j * gridH + Y_OFFSET;
            ctx.beginPath();
            ctx.moveTo(X_OFFSET, y);
            ctx.lineTo(X_OFFSET + W, y);
            ctx.stroke();
        }

        // Draw vertical lines, skipping the river for inner lines
        for (let i = 1; i < BOARD_WIDTH - 1; i++) {
            const x = i * gridW + X_OFFSET;
            const riverTopY = 4 * gridH + Y_OFFSET;
            const riverBottomY = 5 * gridH + Y_OFFSET;
            
            ctx.beginPath();
            ctx.moveTo(x, Y_OFFSET);
            ctx.lineTo(x, riverTopY);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(x, riverBottomY);
            ctx.lineTo(x, Y_OFFSET + H);
            ctx.stroke();
        }

        // Draw palaces
        drawPalace(3, 0, 5, 2);
        drawPalace(3, 7, 5, 9);
        
        // Draw river text
        ctx.font = `bold ${Math.min(gridW, gridH) * 0.7}px "KaiTi", "STKaiti", "Microsoft YaHei", sans-serif`;
        ctx.fillStyle = '#333';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const riverY = 4.5 * gridH + Y_OFFSET;
        ctx.fillText('楚', 1.5 * gridW + X_OFFSET, riverY, gridW);
        ctx.fillText('河', 2.5 * gridW + X_OFFSET, riverY, gridW);
        ctx.fillText('漢', 5.5 * gridW + X_OFFSET, riverY, gridW);
        ctx.fillText('界', 6.5 * gridW + X_OFFSET, riverY, gridW);
    }
    
    function drawPalace(x1, y1, x2, y2) {
        const gridW = canvas.width / BOARD_WIDTH;
        const gridH = canvas.height / BOARD_HEIGHT;
        const X_OFFSET = gridW / 2;
        const Y_OFFSET = gridH / 2;
        
        const p_x1 = x1 * gridW + X_OFFSET;
        const p_y1 = y1 * gridH + Y_OFFSET;
        const p_x2 = x2 * gridW + X_OFFSET;
        const p_y2 = y2 * gridH + Y_OFFSET;
        
        ctx.beginPath();
        ctx.moveTo(p_x1, p_y1);
        ctx.lineTo(p_x2, p_y2);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(p_x2, p_y1);
        ctx.lineTo(p_x1, p_y2);
        ctx.stroke();
    }

    function drawPieces() {
        const gridW = canvas.width / BOARD_WIDTH;
        const gridH = canvas.height / BOARD_HEIGHT;
        const pieceRadius = Math.min(gridW, gridH) / 2 * 0.85;

        for (let y = 0; y < BOARD_HEIGHT; y++) {
            for (let x = 0; x < BOARD_WIDTH; x++) {
                const piece = board[y][x];
                if (piece !== 0) {
                    drawPiece(x, y, piece, gridW, gridH, pieceRadius);
                }
            }
        }

        if (lastMove) {
            highlightSquare(lastMove.fromX, lastMove.fromY, 'rgba(0, 255, 0, 0.5)');
            highlightSquare(lastMove.toX, lastMove.toY, 'rgba(0, 255, 0, 1)');
        }

        if (selectedPiece) {
             highlightSquare(selectedPiece.x, selectedPiece.y, '#00ff00');
        }
    }
    
    function highlightSquare(x, y, color) {
        const gridW = canvas.width / BOARD_WIDTH;
        const gridH = canvas.height / BOARD_HEIGHT;
        const pieceRadius = Math.min(gridW, gridH) / 2 * 0.85;
        const canvasX = x * gridW + gridW / 2;
        const canvasY = y * gridH + gridH / 2;
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(canvasX, canvasY, pieceRadius + 2, 0, 2 * Math.PI);
        ctx.stroke();
    }


    function drawPiece(x, y, piece, gridW, gridH, pieceRadius) {
        const canvasX = x * gridW + gridW / 2;
        const canvasY = y * gridH + gridH / 2;
        const color = getPieceColor(piece);

        ctx.fillStyle = '#ffddaa'; // Wood color
        ctx.beginPath();
        ctx.arc(canvasX, canvasY, pieceRadius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = color === 'red' ? '#d43d3d' : '#333';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = color === 'red' ? '#d43d3d' : '#333';
        ctx.font = `bold ${pieceRadius}px "KaiTi", "STKaiti", "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(PIECE_TEXT[piece], canvasX, canvasY);
    }
    
    function updateGameInfo() {
        currentPlayerSpan.textContent = currentPlayer === 'red' ? '红方' : '黑方';
        currentPlayerSpan.style.color = currentPlayer === 'red' ? '#d43d3d' : '#333';
        statusMessageP.textContent = '';
        if (gameMode === 'online') {
            statusMessageP.textContent = currentPlayer === playerColor ? '轮到你走棋' : '等待对手走棋';
        }
    }

    function handleBoardClick(event) {
        if (isGameOver) return;
        if (gameMode === 'online' && currentPlayer !== playerColor) return;
        if (gameMode === 'pve' && currentPlayer === 'black') return;

        const rect = canvas.getBoundingClientRect();

        const canvasX = event.clientX - rect.left;
        const canvasY = event.clientY - rect.top;

        const gridW = canvas.width / BOARD_WIDTH;
        const gridH = canvas.height / BOARD_HEIGHT;

        const x = Math.round((canvasX - gridW / 2) / gridW);
        const y = Math.round((canvasY - gridH / 2) / gridH);

        if (x < 0 || x >= BOARD_WIDTH || y < 0 || y >= BOARD_HEIGHT) return;

        const clickedPiece = board[y][x];
        const clickedColor = getPieceColor(clickedPiece);

        if (selectedPiece) {
            // If the user clicks another one of their own pieces
            if (clickedColor === currentPlayer) {
                if (selectedPiece.x === x && selectedPiece.y === y) {
                    // Clicked the same piece again, so deselect
                    selectedPiece = null;
                } else {
                    // Clicked a different piece, so re-select
                    selectedPiece = { x, y, piece: clickedPiece };
                }
            } else {
                // Attempting to move to an empty square or capture an opponent's piece
                const move = { fromX: selectedPiece.x, fromY: selectedPiece.y, toX: x, toY: y };
                if (isValidMove(move.fromX, move.fromY, move.toX, move.toY, currentPlayer)) {
                    executeMove(move);
                    if (gameMode === 'online' && conn) {
                        conn.send({ type: 'move', move: move });
                    }
                } else {
                    // Invalid move, deselect the piece
                    statusMessageP.textContent = '无效走法!';
                    setTimeout(() => { if (statusMessageP.textContent === '无效走法!') statusMessageP.textContent = ''; }, 2000);
                    selectedPiece = null;
                }
            }
        } else if (clickedColor === currentPlayer) {
            // No piece is selected yet, so select this one
            selectedPiece = { x, y, piece: clickedPiece };
        }

        drawBoard();
        drawPieces();
    }
    
    function executeMove(move) {
        const { fromX, fromY, toX, toY } = move;
        const movingPiece = board[fromY][fromX];
        const capturedPiece = board[toY][toX];

        if (movingPiece === 0) return;

        const boardStateBeforeMove = JSON.parse(JSON.stringify(board));
        
        moveHistory.push({ move, boardState: boardStateBeforeMove, player: currentPlayer });
        
        board[toY][toX] = movingPiece;
        board[fromY][fromX] = 0;
        
        lastMove = move;
        selectedPiece = null;
        
        currentPlayer = currentPlayer === 'red' ? 'black' : 'red';
        
        updateGameInfo();

        const opponentColor = currentPlayer;
        if (isKingInCheck(opponentColor)) {
            statusMessageP.textContent = (opponentColor === 'red' ? '红方' : '黑方') + '被将军!';
            if (isCheckmate(opponentColor)) {
                statusMessageP.textContent = '绝杀! ' + (opponentColor === 'red' ? '黑方' : '红方') + '胜利!';
                isGameOver = true;
            }
        } else if (isStalemate(opponentColor)) {
            statusMessageP.textContent = '和棋!';
            isGameOver = true;
        }

        drawBoard();
        drawPieces();

        if (!isGameOver && gameMode === 'pve' && currentPlayer === 'black') {
            setTimeout(makeAIMove, 500);
        }
    }

    function undoMove() {
        if (moveHistory.length === 0) {
            statusMessageP.textContent = '没有可以悔的棋了.';
            return;
        }

        const lastMoveData = moveHistory.pop();
        board = lastMoveData.boardState;
        currentPlayer = lastMoveData.player;
        lastMove = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1].move : null;
        isGameOver = false; // Game is not over if we undo

        drawBoard();
        drawPieces();
    }

    function isValidMove(fromX, fromY, toX, toY, player, isCheckingCheck = false) {
        const piece = board[fromY][fromX];
        if (piece === 0) return false;

        const targetPiece = board[toY][toX];
        if (targetPiece !== 0 && getPieceColor(targetPiece) === player) {
            return false;
        }

        let isValid = false;
        switch (piece) {
            case 1: case 8: isValid = isValidMoveChariot(fromX, fromY, toX, toY); break;
            case 2: case 9: isValid = isValidMoveHorse(fromX, fromY, toX, toY); break;
            case 3: case 10: isValid = isValidMoveElephant(fromX, fromY, toX, toY); break;
            case 4: case 11: isValid = isValidMoveAdvisor(fromX, fromY, toX, toY); break;
            case 5: case 12: isValid = isValidMoveGeneral(fromX, fromY, toX, toY); break;
            case 6: case 13: isValid = isValidMoveCannon(fromX, fromY, toX, toY); break;
            case 7: case 14: isValid = isValidMovePawn(fromX, fromY, toX, toY); break;
        }

        if (!isValid) return false;

        // Any move is invalid if it results in your own king being in check.
        // The isCheckingCheck flag prevents infinite recursion between isValidMove and isKingInCheck
        if (!isCheckingCheck) {
            const originalBoard = JSON.parse(JSON.stringify(board));
            
            // Make the move hypothetically
            board[toY][toX] = piece;
            board[fromY][fromX] = 0;

            const selfInCheck = isKingInCheck(player);
            
            // Revert to original board state
            board = originalBoard;

            if (selfInCheck) {
                return false;
            }
        }

        return true;
    }
    
    function countPiecesBetween(fromX, fromY, toX, toY) {
        let count = 0;
        if (fromX === toX) { // Vertical
            const start = Math.min(fromY, toY) + 1;
            const end = Math.max(fromY, toY) - 1;
            for (let y = start; y <= end; y++) {
                if (board[y][fromX] !== 0) count++;
            }
        } else if (fromY === toY) { // Horizontal
            const start = Math.min(fromX, toX) + 1;
            const end = Math.max(fromX, toX) - 1;
            for (let x = start; x <= end; x++) {
                if (board[fromY][x] !== 0) count++;
            }
        }
        return count;
    }

    function isValidMoveChariot(fromX, fromY, toX, toY) {
        if (fromX !== toX && fromY !== toY) return false;
        return countPiecesBetween(fromX, fromY, toX, toY) === 0;
    }

    function isValidMoveHorse(fromX, fromY, toX, toY) {
        const dx = Math.abs(toX - fromX);
        const dy = Math.abs(toY - fromY);
        if (!((dx === 1 && dy === 2) || (dx === 2 && dy === 1))) return false;
        
        // Check for block
        if (dx === 2) {
            if (board[fromY][fromX + (toX - fromX) / 2] !== 0) return false;
        } else { // dy === 2
            if (board[fromY + (toY - fromY) / 2][fromX] !== 0) return false;
        }
        return true;
    }

    function isValidMoveElephant(fromX, fromY, toX, toY) {
        const pieceColor = getPieceColor(board[fromY][fromX]);
        const dx = Math.abs(toX - fromX);
        const dy = Math.abs(toY - fromY);
        if (!(dx === 2 && dy === 2)) return false;
        
        // Cannot cross river
        if (pieceColor === 'red' && toY < 5) return false;
        if (pieceColor === 'black' && toY > 4) return false;
        
        // Check for block
        if (board[fromY + (toY-fromY)/2][fromX + (toX-fromX)/2] !== 0) return false;

        return true;
    }

    function isValidMoveAdvisor(fromX, fromY, toX, toY) {
        const dx = Math.abs(toX - fromX);
        const dy = Math.abs(toY - fromY);
        if (!(dx === 1 && dy === 1)) return false;
        
        // Must stay in palace
        if (toX < 3 || toX > 5) return false;
        const pieceColor = getPieceColor(board[fromY][fromX]);
        if (pieceColor === 'red' && (toY < 7 || toY > 9)) return false;
        if (pieceColor === 'black' && (toY < 0 || toY > 2)) return false;

        return true;
    }

    function isValidMoveGeneral(fromX, fromY, toX, toY) {
        const dx = Math.abs(toX - fromX);
        const dy = Math.abs(toY - fromY);

        // Flying General rule check
        const pieceColor = getPieceColor(board[fromY][fromX]);
        const opponentColor = pieceColor === 'red' ? 'black' : 'red';
        const opponentGeneralPiece = opponentColor === 'red' ? 5 : 12;
        const opponentKingPos = findPiece(opponentGeneralPiece);

        if (opponentKingPos && toX === opponentKingPos.x && fromX === opponentKingPos.x) {
            if (countPiecesBetween(fromX, fromY, opponentKingPos.x, opponentKingPos.y) === 0) {
                return true;
            }
        }
        
        if (!(dx + dy === 1)) return false;
        
        // Must stay in palace
        if (toX < 3 || toX > 5) return false;
        if (pieceColor === 'red' && (toY < 7 || toY > 9)) return false;
        if (pieceColor === 'black' && (toY < 0 || toY > 2)) return false;

        return true;
    }

    function isValidMoveCannon(fromX, fromY, toX, toY) {
        if (fromX !== toX && fromY !== toY) return false;
        const piecesBetween = countPiecesBetween(fromX, fromY, toX, toY);
        const isCapture = board[toY][toX] !== 0;

        if (isCapture) {
            return piecesBetween === 1;
        } else {
            return piecesBetween === 0;
        }
    }

    function isValidMovePawn(fromX, fromY, toX, toY) {
        const pieceColor = getPieceColor(board[fromY][fromX]);
        const dx = toX - fromX;
        const dy = toY - fromY;

        if (pieceColor === 'red') {
            if (fromY > 4) { // Has not crossed the river
                return dx === 0 && dy === -1;
            } else { // Has crossed the river
                return (dx === 0 && dy === -1) || (Math.abs(dx) === 1 && dy === 0);
            }
        } else { // Black pawn
            if (fromY < 5) { // Has not crossed the river
                return dx === 0 && dy === 1;
            } else { // Has crossed the river
                return (dx === 0 && dy === 1) || (Math.abs(dx) === 1 && dy === 0);
            }
        }
    }
    
    function findPiece(pieceToFind) {
        for (let y = 0; y < BOARD_HEIGHT; y++) {
            for (let x = 0; x < BOARD_WIDTH; x++) {
                if (board[y][x] === pieceToFind) {
                    return { x, y };
                }
            }
        }
        return null;
    }

    function isKingInCheck(kingColor) {
        const kingPiece = kingColor === 'red' ? 5 : 12;
        const opponentColor = kingColor === 'red' ? 'black' : 'red';
        const kingPos = findPiece(kingPiece);

        if (!kingPos) return true; // King is captured, which is the ultimate check.

        // Check if opponent's pieces can attack the king
        for (let y = 0; y < BOARD_HEIGHT; y++) {
            for (let x = 0; x < BOARD_WIDTH; x++) {
                const piece = board[y][x];
                if (piece !== 0 && getPieceColor(piece) === opponentColor) {
                    if (isValidMove(x, y, kingPos.x, kingPos.y, opponentColor, true)) {
                        return true;
                    }
                }
            }
        }
        
        // "Flying general" rule
        const opponentKingPiece = kingColor === 'red' ? 12 : 5;
        const opponentKingPos = findPiece(opponentKingPiece);
        if (opponentKingPos && opponentKingPos.x === kingPos.x) {
            if (countPiecesBetween(kingPos.x, kingPos.y, opponentKingPos.x, opponentKingPos.y) === 0) {
                return true;
            }
        }

        return false;
    }
    
    function getAllPossibleMoves(color) {
        const moves = [];
        for (let y = 0; y < BOARD_HEIGHT; y++) {
            for (let x = 0; x < BOARD_WIDTH; x++) {
                if (board[y][x] !== 0 && getPieceColor(board[y][x]) === color) {
                    for (let toY = 0; toY < BOARD_HEIGHT; toY++) {
                        for (let toX = 0; toX < BOARD_WIDTH; toX++) {
                            if (isValidMove(x, y, toX, toY, color)) {
                                moves.push({fromX: x, fromY: y, toX: toX, toY: toY});
                            }
                        }
                    }
                }
            }
        }
        return moves;
    }

    function isCheckmate(kingColor) {
        if (!isKingInCheck(kingColor)) return false;
    
        const allMoves = getAllPossibleMoves(kingColor);
    
        for (const move of allMoves) {
            const { fromX, fromY, toX, toY } = move;
            const movingPiece = board[fromY][fromX];
            const originalPiece = board[toY][toX];
            
            // Try the move
            board[toY][toX] = movingPiece;
            board[fromY][fromX] = 0;
            
            const stillInCheck = isKingInCheck(kingColor);
            
            // Revert the move
            board[fromY][fromX] = movingPiece;
            board[toY][toX] = originalPiece;
            
            if (!stillInCheck) {
                return false; // Found a move to escape check
            }
        }
    
        return true; // No move can escape check
    }

    function isStalemate(color) {
        if (isKingInCheck(color)) return false;
        
        const allMoves = getAllPossibleMoves(color);

        for (const move of allMoves) {
            const { fromX, fromY, toX, toY } = move;
            const movingPiece = board[fromY][fromX];
            const originalPiece = board[toY][toX];
            
            board[toY][toX] = movingPiece;
            board[fromY][fromX] = 0;
            
            const wouldBeInCheck = isKingInCheck(color);
            
            board[fromY][fromX] = movingPiece;
            board[toY][toX] = originalPiece;
            
            if (!wouldBeInCheck) {
                return false; // Found a legal move
            }
        }

        return true; // No legal moves
    }

    function getPieceValue(piece, x, y) {
        const pieceType = piece > 7 ? piece - 7 : piece;
        const isRed = piece <= 7;
        // Positional value can be added here
        switch (pieceType) {
            case 1: return 900; // 车
            case 2: return 400; // 马
            case 3: return 200; // 象
            case 4: return 200; // 士
            case 5: return 10000; // 将
            case 6: return 450; // 炮
            case 7: // 兵
                if (isRed) {
                    return y < 5 ? 200 : 100;
                } else {
                    return y > 4 ? 200 : 100;
                }
            default: return 0;
        }
    }

    function evaluateBoard() {
        let totalScore = 0;
        for (let y = 0; y < BOARD_HEIGHT; y++) {
            for (let x = 0; x < BOARD_WIDTH; x++) {
                const piece = board[y][x];
                if (piece !== 0) {
                    const value = getPieceValue(piece, x, y);
                    if (getPieceColor(piece) === 'red') {
                        totalScore -= value;
                    } else {
                        totalScore += value;
                    }
                }
            }
        }
        return totalScore;
    }

    const minimaxCache = new Map();
    function minimax(depth, isMaximizing) {
        const cacheKey = `${depth}-${isMaximizing}-${JSON.stringify(board)}`;
        if (minimaxCache.has(cacheKey)) {
            return minimaxCache.get(cacheKey);
        }

        if (depth === 0) {
            return evaluateBoard();
        }

        const color = isMaximizing ? 'black' : 'red';
        const moves = getAllPossibleMoves(color);
        let bestValue = isMaximizing ? -Infinity : Infinity;

        for (const move of moves) {
            const { fromX, fromY, toX, toY } = move;
            const movingPiece = board[fromY][fromX];
            const capturedPiece = board[toY][toX];

            board[toY][toX] = movingPiece;
            board[fromY][fromX] = 0;
            
            if(isKingInCheck(color)) {
                // Revert if this move puts own king in check
                board[fromY][fromX] = movingPiece;
                board[toY][toX] = capturedPiece;
                continue;
            }

            const value = minimax(depth - 1, !isMaximizing);
            
            if (isMaximizing) {
                bestValue = Math.max(bestValue, value);
            } else {
                bestValue = Math.min(bestValue, value);
            }
            
            // Revert move
            board[fromY][fromX] = movingPiece;
            board[toY][toX] = capturedPiece;
        }

        minimaxCache.set(cacheKey, bestValue);
        return bestValue;
    }

    function makeAIMove() {
        const depth = 2; // AI search depth
        let bestMove = null;
        let bestValue = -Infinity;
        const moves = getAllPossibleMoves('black');

        for (const move of moves) {
            const { fromX, fromY, toX, toY } = move;
            const movingPiece = board[fromY][fromX];
            const capturedPiece = board[toY][toX];

            board[toY][toX] = movingPiece;
            board[fromY][fromX] = 0;
            
            // Don't make a move that leaves the king in check
            if (isKingInCheck('black')) {
                board[fromY][fromX] = movingPiece;
                board[toY][toX] = capturedPiece;
                continue;
            }

            const boardValue = minimax(depth - 1, false);
            
            // Revert move
            board[fromY][fromX] = movingPiece;
            board[toY][toX] = capturedPiece;
            
            if (boardValue > bestValue) {
                bestValue = boardValue;
                bestMove = move;
            }
        }
        
        if (bestMove) {
            executeMove(bestMove);
        } else {
            // No valid moves, maybe stalemate or checkmate
            console.log("AI can't find a move.");
        }
    }

    function resizeCanvas() {
        const container = document.getElementById('chessboard-container');
        const size = container.clientWidth;
        canvas.width = size;
        canvas.height = size * (BOARD_HEIGHT / BOARD_WIDTH);
        drawBoard();
        drawPieces();
    }

    // --- Online Mode Logic ---
    function initOnlineMode() {
        if (peer && peer.open) return;
        onlineStatus.textContent = '正在连接服务器...';
        
        const peerId = 'xiangqi-h5-' + Math.random().toString(36).substr(2, 9);

        peer = new Peer(peerId, {
            host: 'peerjs.92k.de',
            path: '/', 
            secure: true,
            debug: 2,
        });

        peer.on('open', (id) => { 
            onlineStatus.textContent = `我的ID: ${id} (可分享给好友)`; 
            createRoomBtn.disabled = false;
            joinRoomBtn.disabled = false;
        });
        peer.on('connection', (c) => { 
            conn = c; 
            onlineStatus.textContent = '有玩家正在连接...';
            setupConnectionEvents(); 
        });
        peer.on('error', (err) => { 
            console.error('PeerJS error:', err); 
            onlineStatus.textContent = `连接错误: ${err.type}.`; 
        });
    }

    function createRoom() {
        playerColor = 'red';
        onlineStatus.textContent = `房间已创建, 等待好友加入... (ID: ${peer.id})`;
        // Don't init board yet, wait for connection
    }

    function joinRoom() {
        const remoteId = roomIdInput.value.trim();
        if (!remoteId || !peer) return;
        
        onlineStatus.textContent = `正在连接到 ${remoteId}...`;
        conn = peer.connect(remoteId, { reliable: true });

        conn.on('open', () => {
            playerColor = 'black'; 
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
                    if (playerColor === 'red') {
                        initBoard(); // Host inits board now
                        conn.send({
                            type: 'sync_response',
                            board: board,
                            currentPlayer: currentPlayer,
                            moveHistory: moveHistory
                        });
                        onlineStatus.textContent = '玩家已连接. 您是红方，请走棋.';
                        showGameView();
                    }
                    break;
                case 'sync_response':
                    board = data.board;
                    currentPlayer = data.currentPlayer;
                    moveHistory = data.moveHistory;
                    lastMove = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1].move : null;
                    isGameOver = false;
                    updateGameInfo();
                    onlineStatus.textContent = `同步成功! 您是黑方.`;
                    showGameView();
                    break;
                case 'move':
                    executeMove(data.move);
                    break;
                case 'reset_request':
                    if (confirm('对手请求重新开始，是否同意?')) {
                        conn.send({ type: 'reset_accept' });
                        initBoard();
                    }
                    break;
                case 'reset_accept':
                    initBoard();
                    statusMessageP.textContent = '对手同意了重开游戏.';
                    break;
            }
        });
        conn.on('close', () => { 
            onlineStatus.textContent = '对手已断开连接'; 
            showModeSelectionView();
        });
    }
    
    // --- Event Listeners ---
    // Mode Selection
    pveButton.addEventListener('click', () => startGame('pve'));
    pvpButton.addEventListener('click', () => startGame('pvp'));
    onlineButton.addEventListener('click', () => {
        onlineOptions.classList.toggle('hidden');
        if (!peer) {
            startGame('online');
        }
    });
    createRoomBtn.addEventListener('click', createRoom);
    joinRoomBtn.addEventListener('click', joinRoom);

    // Game View
    canvas.addEventListener('click', handleBoardClick);
    window.addEventListener('resize', resizeCanvas);
    
    resetButton.addEventListener('click', () => {
        if (gameMode === 'online' && conn && !isGameOver) {
            conn.send({ type: 'reset_request' });
            statusMessageP.textContent = '已发送重开请求...';
        } else {
            initBoard();
        }
    });
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
            document.documentElement.requestFullscreen();
            fullscreenBtn.textContent = '退出全屏';
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
                fullscreenBtn.textContent = '全屏';
            }
        }
    });

    backBtn.addEventListener('click', showModeSelectionView);
    
    // Initial state
    showModeSelectionView();
});