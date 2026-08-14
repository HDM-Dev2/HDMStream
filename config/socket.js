module.exports = {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 30000,
  maxHttpBufferSize: 5e6,
  transports: ['polling', 'websocket'],
  allowUpgrades: false,
  perMessageDeflate: {
    threshold: 1024
  },
  cookie: false,
  allowEIO3: true
};