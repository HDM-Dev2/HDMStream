module.exports = {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['polling', 'websocket'],
  allowUpgrades: true,
  cookie: false,
  allowEIO3: true,
  maxHttpBufferSize: 5e6
};