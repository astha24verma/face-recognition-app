const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  faceDescriptor: { type: Array, required: true, unique: true},
});

const User = mongoose.model('User', userSchema);

module.exports = User;