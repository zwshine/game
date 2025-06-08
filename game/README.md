# 中国传统游戏合集

这是一个基于Web的游戏合集，包含以下游戏：
- 台球
- 五子棋
- 中国象棋

## 技术栈
- 后端：Node.js + Express + Socket.IO
- 前端：React + Matter.js
- 数据库：无（暂时使用内存存储）

## 安装步骤

1. 克隆仓库
```bash
git clone [repository-url]
cd chinese-games-collection
```

2. 安装后端依赖
```bash
npm install
```

3. 安装前端依赖
```bash
npm run install-client
```

4. 运行开发环境
```bash
# 终端1：运行后端服务器
npm run dev

# 终端2：运行前端开发服务器
npm run client
```

## 部署说明（Debian服务器）

1. 安装Node.js和npm
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

2. 克隆并构建项目
```bash
git clone [repository-url]
cd chinese-games-collection
npm install
npm run install-client
npm run build
```

3. 使用PM2运行服务器
```bash
sudo npm install -g pm2
pm2 start server.js
``` 