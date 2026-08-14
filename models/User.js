const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    sparse: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    sparse: true
  },
  authProvider: {
    type: String,
    enum: ['local', 'farmvexa'],
    default: 'local'
  },
  farmvexaId: {
    type: String,
    sparse: true,
    unique: true
  },
  farmvexaData: {
    name: String,
    farmId: String,
    role: String,
    county: String,
    subCounty: String,
    phone: String,
    farms: [{
      id: String,
      name: String,
      county: String,
      subCounty: String
    }]
  },
  deviceName: {
    type: String,
    default: ''
  },
  lastLogin: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

userSchema.pre('save', async function(next) {
  if (this.isModified('password') && this.password) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

userSchema.methods.comparePassword = function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);