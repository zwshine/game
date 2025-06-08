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

    const GRID_SIZE = 60;
    const BOARD_WIDTH = 9;
    const BOARD_HEIGHT = 10;
    const PIECE_RADIUS = 26;

    // Board representation
    // 0: empty, 1-7: red, 8-14: black
    // 1/8: 车 (Chariot), 2/9: 马 (Horse), 3/10: 象 (Elephant), 4/11: 士 (Advisor)
    // 5/12: 将 (General), 6/13: 炮 (Cannon), 7/14: 兵 (Pawn)
    let board = [];
    let moveHistory = [];
    let lastMove = null;
    let currentPlayer = 'red'; // 'red' or 'black'
    let selectedPiece = null; // { x, y, piece }
    let isGameOver = false;
    let isAIMode = false;
    
    // Online Play State
    let isOnlineMode = false;
    let peer = null;
    let conn = null;
    let playerColor = 'red'; // 'red' for host, 'black' for joiner

    const PIECE_TEXT = {
        1: '车', 2: '马', 3: '相', 4: '仕', 5: '帅', 6: '炮', 7: '兵',
        8: '車', 9: '馬', 10: '象', 11: '士', 12: '将', 13: '砲', 14: '卒'
    };

    function getPieceColor(piece) {
        if (piece === 0) return null;
        return piece >= 1 && piece <= 7 ? 'red' : 'black';
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
        
        if (isAIMode && currentPlayer === 'black' && !isGameOver) {
            setTimeout(makeAIMove, 500);
        }
    }

    function drawBoard() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 2;

        // Draw grid lines
        for (let i = 0; i < BOARD_WIDTH; i++) {
            for (let j = 0; j < BOARD_HEIGHT; j++) {
                const x = (i + 0.5) * GRID_SIZE;
                const y = (j + 0.5) * GRID_SIZE;
                
                // Vertical lines
                if (j < BOARD_HEIGHT - 1) {
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x, y + GRID_SIZE);
                    ctx.stroke();
                }

                // Horizontal lines
                if (i < BOARD_WIDTH - 1) {
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + GRID_SIZE, y);
                    ctx.stroke();
                }
            }
        }
        
        // Fix board boundaries
        ctx.strokeRect(GRID_SIZE/2, GRID_SIZE/2, GRID_SIZE * (BOARD_WIDTH - 1), GRID_SIZE * (BOARD_HEIGHT - 1));


        // Draw river
        ctx.font = '24px "KaiTi", "STKaiti", "Microsoft YaHei", sans-serif';
        ctx.fillStyle = '#000';
        ctx.fillText('楚 河', 1.5 * GRID_SIZE, 5 * GRID_SIZE);
        ctx.fillText('漢 界', 5.5 * GRID_SIZE, 5 * GRID_SIZE);

        // Draw palaces (九宫)
        drawPalace(4.5, 1.5);
        drawPalace(4.5, 8.5);
    }
    
    function drawPalace(cx, cy) {
        const x = (cx - 1) * GRID_SIZE;
        const y = (cy - 1) * GRID_SIZE;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 2*GRID_SIZE, y + 2*GRID_SIZE);
        ctx.moveTo(x + 2*GRID_SIZE, y);
        ctx.lineTo(x, y + 2*GRID_SIZE);
        ctx.stroke();
    }

    function highlightSquare(x, y, color) {
        const canvasX = (x + 0.5) * GRID_SIZE;
        const canvasY = (y + 0.5) * GRID_SIZE;
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(canvasX, canvasY, PIECE_RADIUS + 4, 0, 2 * Math.PI);
        ctx.stroke();
    }

    function drawPieces() {
        const drawBoardPieces = () => {
            for (let y = 0; y < BOARD_HEIGHT; y++) {
                for (let x = 0; x < BOARD_WIDTH; x++) {
                    const piece = board[y][x];
                    if (piece !== 0) {
                        drawPiece(x, y, piece);
                    }
                }
            }
        };

        drawBoardPieces();
        
        if (lastMove) {
            highlightSquare(lastMove.fromX, lastMove.fromY, 'rgba(0, 255, 0, 0.5)');
            highlightSquare(lastMove.toX, lastMove.toY, 'rgba(0, 255, 0, 1)');
        }

        if (selectedPiece) {
            const {x, y} = selectedPiece;
            const canvasX = (x + 0.5) * GRID_SIZE;
            const canvasY = (y + 0.5) * GRID_SIZE;
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(canvasX, canvasY, PIECE_RADIUS + 2, 0, 2 * Math.PI);
            ctx.stroke();
        }
    }

    function drawPiece(x, y, piece) {
        const canvasX = (x + 0.5) * GRID_SIZE;
        const canvasY = (y + 0.5) * GRID_SIZE;
        const color = getPieceColor(piece);

        ctx.fillStyle = '#ffddaa'; // Wood color
        ctx.beginPath();
        ctx.arc(canvasX, canvasY, PIECE_RADIUS, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = color === 'red' ? '#d43d3d' : '#333';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = color === 'red' ? '#d43d3d' : '#333';
        ctx.font = `${PIECE_RADIUS}px "KaiTi", "STKaiti", "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(PIECE_TEXT[piece], canvasX, canvasY);
    }
    
    function updateGameInfo() {
        currentPlayerSpan.textContent = currentPlayer === 'red' ? '红方' : '黑方';
        currentPlayerSpan.style.color = currentPlayer === 'red' ? '#d43d3d' : '#333';
        statusMessageP.textContent = ''; // Clear previous status
        if (isOnlineMode) {
            statusMessageP.textContent = currentPlayer === playerColor ? '轮到你走棋' : '等待对手走棋';
        }
    }

    function handleBoardClick(event) {
        if (isGameOver) return;
        if (isOnlineMode && currentPlayer !== playerColor) return;
        if (isAIMode && currentPlayer === 'black') return; // Prevent clicking during AI's turn
        
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        const canvasX = (event.clientX - rect.left) * scaleX;
        const canvasY = (event.clientY - rect.top) * scaleY;

        const x = Math.round(canvasX / GRID_SIZE - 0.5);
        const y = Math.round(canvasY / GRID_SIZE - 0.5);

        if (x < 0 || x >= BOARD_WIDTH || y < 0 || y >= BOARD_HEIGHT) return;

        const clickedPiece = board[y][x];
        const clickedColor = getPieceColor(clickedPiece);

        if (selectedPiece) {
            const move = { fromX: selectedPiece.x, fromY: selectedPiece.y, toX: x, toY: y };
            if (isValidMove(move.fromX, move.fromY, move.toX, move.toY, currentPlayer)) {
                // The target square either has an opponent piece or is empty.
                executeMove(move);
                if (isOnlineMode && conn) {
                    conn.send({ type: 'move', move: move });
                }
            } else {
                 statusMessageP.textContent = '无效走法!';
                 setTimeout(() => { if(statusMessageP.textContent === '无效走法!') statusMessageP.textContent = ''; }, 2000);
                 selectedPiece = null;
            }
        } else if (clickedColor === currentPlayer) {
            // If no piece is selected, select the clicked piece.
            selectedPiece = { x, y, piece: clickedPiece };
        } else {
            // If a piece was not selected, and an invalid square was clicked, clear selection.
            selectedPiece = null;
        }
        
        drawBoard();
        drawPieces();
    }
    
    function executeMove(move) {
        const { fromX, fromY, toX, toY } = move;
        const movingPiece = board[fromY][fromX];
        const capturedPiece = board[toY][toX];

        const moveRecord = { ...move, movingPiece, capturedPiece };
        
        // Make the move on the board
        board[toY][toX] = movingPiece;
        board[fromY][fromX] = 0;

        // If the move results in the king being in check, it's illegal.
        const movingPlayer = getPieceColor(movingPiece);
        if (isKingInCheck(movingPlayer)) {
            board[fromY][fromX] = movingPiece;
            board[toY][toX] = capturedPiece; // Revert the move
            statusMessageP.textContent = '帅（将）被将军，无效走法!';
            setTimeout(() => { if(statusMessageP.textContent.includes('帅（将）被将军')) statusMessageP.textContent = ''; }, 2000);
            selectedPiece = null;
            // No redraw needed here, handleBoardClick will do it.
            return; // Stop execution
        }

        // Legal move, commit it
        moveHistory.push(moveRecord);
        lastMove = moveRecord;
        selectedPiece = null;

        // Check for win by capturing the general
        if (capturedPiece === 5 || capturedPiece === 12) {
            isGameOver = true;
            const winner = movingPlayer === 'red' ? '红方' : '黑方';
            statusMessageP.textContent = `游戏结束! ${winner}胜利!`;
            updateGameInfo();
            drawBoard();
            drawPieces();
            return;
        }
        
        currentPlayer = currentPlayer === 'red' ? 'black' : 'red';
        
        updateGameInfo();
        
        // Check for check status
        const opponentColor = currentPlayer;
        if (isKingInCheck(opponentColor)) {
            statusMessageP.textContent = `${opponentColor === 'red' ? '红方' : '黑方'}被将军!`;
        }

        // Always redraw after a move is executed.
        drawBoard();
        drawPieces();

        if (isAIMode && currentPlayer === 'black' && !isGameOver) {
            setTimeout(makeAIMove, 500);
        }
    }

    function undoMove() {
        if (isGameOver) isGameOver = false;

        const steps = isAIMode ? 2 : 1;
        if (moveHistory.length < steps) return;

        for (let i = 0; i < steps; i++) {
            const last = moveHistory.pop();
            if (last) {
                board[last.fromY][last.fromX] = last.movingPiece;
                board[last.toY][last.toX] = last.capturedPiece;
                currentPlayer = getPieceColor(last.movingPiece);
            }
        }
        
        lastMove = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1] : null;
        selectedPiece = null;
        
        updateGameInfo();
        drawBoard();
        drawPieces();
    }

    function isValidMove(fromX, fromY, toX, toY, player) {
        const piece = board[fromY][fromX];
        const pieceType = piece > 7 ? piece - 7 : piece;
        
        // Cannot move to the same spot
        if (fromX === toX && fromY === toY) return false;
        
        const targetPieceColor = getPieceColor(board[toY][toX]);
        if (targetPieceColor === player) {
            return false; // Cannot capture own piece
        }

        switch (pieceType) {
            case 1: return isValidMoveChariot(fromX, fromY, toX, toY); // 车
            case 2: return isValidMoveHorse(fromX, fromY, toX, toY);   // 马
            case 3: return isValidMoveElephant(fromX, fromY, toX, toY);// 象
            case 4: return isValidMoveAdvisor(fromX, fromY, toX, toY); // 士
            case 5: return isValidMoveGeneral(fromX, fromY, toX, toY); // 将
            case 6: return isValidMoveCannon(fromX, fromY, toX, toY);  // 炮
            case 7: return isValidMovePawn(fromX, fromY, toX, toY);    // 兵
            default: return false;
        }
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

        // Flying General rule
        const opponentColor = currentPlayer === 'red' ? 'black' : 'red';
        const opponentGeneralPiece = opponentColor === 'red' ? 5 : 12;
        const [kingX, kingY] = findPiece(opponentGeneralPiece);
        if(kingX !== null && toX === kingX && countPiecesBetween(toX, toY, kingX, kingY) === 0){
             return true;
        }

        if (!(dx + dy === 1)) return false;
        
        // Must stay in palace
        if (toX < 3 || toX > 5) return false;
        const pieceColor = getPieceColor(board[fromY][fromX]);
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
                    return [x, y];
                }
            }
        }
        return [null, null];
    }

    function isKingInCheck(kingColor) {
        const kingPiece = kingColor === 'red' ? 5 : 12;
        const [kingX, kingY] = findPiece(kingPiece);
        if (kingX === null) return false; // Should not happen

        const opponentColor = kingColor === 'red' ? 'black' : 'red';

        for (let y = 0; y < BOARD_HEIGHT; y++) {
            for (let x = 0; x < BOARD_WIDTH; x++) {
                const piece = board[y][x];
                if (piece !== 0 && getPieceColor(piece) === opponentColor) {
                    if(isValidMove(x, y, kingX, kingY, opponentColor)) {
                        return true;
                    }
                }
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

    function toggleAIMode() {
        isAIMode = !isAIMode;
        if (isAIMode) {
            isOnlineMode = false;
            onlineControls.style.display = 'none';
        }
        initBoard();
        aiButton.textContent = isAIMode ? '返回双人模式' : '人机对战';
    }
    
    function initOnlineMode() {
        if (peer && peer.open) return;
        isAIMode = false;
        isOnlineMode = true;
        aiButton.textContent = '人机对战';
        onlineControls.style.display = 'block';
        roomInfo.textContent = '正在初始化...';
        
        const peerId = 'xiangqi-' + Math.random().toString(16).slice(2);

        peer = new Peer(peerId, {
            // Using a public community PeerJS server
            host: 'peerjs.92k.de',
            path: '/', 
            secure: true,
            debug: 2,
            config: {
                'iceServers': [
                    { urls: 'stun:stun.cloudflare.com:3478' }
                ]
            }
        });

        peer.on('open', (id) => { 
            roomInfo.textContent = `我的ID: ${id} (可分享给好友)`; 
            createRoomButton.disabled = false;
            joinRoomButton.disabled = false;
        });
        peer.on('connection', (c) => { 
            conn = c; 
            roomInfo.textContent = '有玩家正在连接...';
            setupConnectionEvents(false);
        });
        peer.on('error', (err) => { 
            console.error('PeerJS error:', err); 
            roomInfo.textContent = `连接错误: ${err.type}. 请刷新页面重试.`; 
        });
    }

    function createRoom() {
        playerColor = 'red';
        initBoard();
        roomInfo.textContent = `房间已创建, 等待好友加入... (ID: ${peer.id})`;
    }

    function joinRoom() {
        const remoteId = roomIdInput.value.trim();
        if (!remoteId || !peer) return;
        
        roomInfo.textContent = `正在连接到 ${remoteId}...`;
        conn = peer.connect(remoteId, { reliable: true });
        setupConnectionEvents(true);
    }

    function setupConnectionEvents(isJoiner) {
        if (!conn) return;
        conn.on('open', () => {
            if (isJoiner) {
                playerColor = 'black'; // Joiner is black
                initBoard(); // init board for joiner. currentPlayer will be 'red'
                roomInfo.textContent = `连接成功! 您是黑方. 等待房主同步棋盘...`;
                // Request full sync from host
                conn.send({type: 'sync_request'});
            }
        });
        conn.on('data', (data) => {
            switch (data.type) {
                case 'sync_request':
                    // Host receives request and sends back the current state
                    if (playerColor === 'red') {
                        conn.send({
                            type: 'sync_response',
                            board: board,
                            currentPlayer: currentPlayer,
                            moveHistory: moveHistory
                        });
                        roomInfo.textContent = '玩家已连接. 您是红方，请走棋.';
                    }
                    break;
                case 'sync_response':
                    // Joiner receives the current state and applies it
                    board = data.board;
                    currentPlayer = data.currentPlayer;
                    moveHistory = data.moveHistory;
                    lastMove = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1] : null;
                    isGameOver = false; // Assume game is ongoing
                    drawBoard();
                    drawPieces();
                    updateGameInfo();
                    roomInfo.textContent = `同步成功! 您是黑方.`;
                    break;
                case 'move':
                    executeMove(data.move);
                    break;
                case 'undo_request':
                    if (confirm('对手请求悔棋，是否同意?')) {
                        conn.send({ type: 'undo_accept' });
                        undoMove();
                    }
                    break;
                case 'undo_accept':
                    undoMove();
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
            roomInfo.textContent = '对手已断开连接'; 
            isOnlineMode = false; 
            conn = null; 
        });
    }
    
    // Event Listeners
    canvas.addEventListener('click', handleBoardClick);
    resetButton.addEventListener('click', () => {
        if (isOnlineMode && conn) {
            conn.send({ type: 'reset_request' });
        } else {
            initBoard();
        }
    });
    undoButton.addEventListener('click', () => {
        if (isOnlineMode && conn) {
            conn.send({ type: 'undo_request' });
        } else {
            undoMove();
        }
    });
    aiButton.addEventListener('click', toggleAIMode);
    onlineButton.addEventListener('click', initOnlineMode);
    createRoomButton.addEventListener('click', createRoom);
    joinRoomButton.addEventListener('click', joinRoom);

    initBoard();
});