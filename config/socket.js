module.exports = {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 30000,
  maxHttpBufferSize: 1e6,
  transports: ['polling', 'websocket'],
  allowUpgrades: true,
  perMessageDeflate: {
    threshold: 1024
  },
  cookie: false,
  allowEIO3: true
};