require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const faceapi = require('face-api.js');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// MongoDB connection

mongoose.connect(process.env.MONGODB_URI, { dbName: "face-recognition-app",})
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log(err));

// Import User model
const User = require('./models/User');

// JWT secret key
const JWT_SECRET = process.env.SECRET_KEY ; //your_secret_key

// Verify JWT token middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  // Verify token
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    res.status(403).json({ error: 'Invalid token' });
  }
};


// Get all data 
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({});
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching users' });
  }
});

// Register user route
app.post('/api/register', async (req, res) => {
  if (!req.body.username || !req.body.descriptors) {
    return res.status(400).json({ error: 'Invalid request' });
  }
  const { username, descriptors } = req.body;
  console.log("Data recieved at server : " + username + " & " + descriptors);

  try {
    // Check if the username already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    //check if descriprors already exists

    // Create a new user document
    const newUser = new User({ username, faceDescriptor: descriptors });
    await newUser.save();
    res.status(201).json({ message: 'User registered successfully' });

  } catch (error) {
    console.log("error registering user => " + error);
    res.status(500).json({ error: 'Error registering user' });
  }
});

app.post('/api/login', async (req, res) => {
  const { descriptors } = req.body;
  console.log(`Received descriptors (type: ${typeof descriptors}):`);
  console.log(descriptors);

  if(descriptors.length === 0) {
    return res.status(400).json({ error: 'No descriptors generated, capture again' });
  }

  try {
    console.log("Finding users...");
    const users = await User.find({});

    if (users.length === 0) {
      console.log("No users data found in the database");
      return res.status(404).json({ error: "No users data found in the database" });
    }

    // Convert descriptors from database to LabeledFaceDescriptors
    const labeledDescriptors = users.reduce((acc, user) => {
      const descriptor = user.faceDescriptor;
      if (Array.isArray(descriptor)) {
        const labeledDescriptor = new faceapi.LabeledFaceDescriptors(
          user.username,
          descriptor.map(desc => new Float32Array(Object.values(desc)))
        );
        acc.push(labeledDescriptor);
      } else {
        console.warn(`Invalid faceDescriptor for user ${user.username}:`, descriptor);
      }
      return acc;
    }, []);

    if (labeledDescriptors.length === 0) {
      console.log("No valid face descriptors found in the database");
      return res.status(404).json({ error: "No valid face descriptors found in the database" });
    }

    // Create a FaceMatcher with the labeled descriptors
    const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);

    // Convert client descriptors to Float32Array
    const clientDescriptorArray = Array.isArray(descriptors) ? descriptors : [descriptors];
    const clientDescriptorFloat32 = clientDescriptorArray.map(desc => new Float32Array(Object.values(desc)));

    console.log("Client descriptors:", clientDescriptorFloat32);

    // Find the best match for the client descriptor
    const bestMatches = clientDescriptorFloat32.map(descriptor => faceMatcher.findBestMatch(descriptor));
    console.log("Best matches:", bestMatches);

    const matchedUser = bestMatches.find(match => match.label !== undefined);
    if (matchedUser) {
      const user = users.find(user => user.username === matchedUser.label);
      console.log(`\n Logged in successfully as ${user.username}`);

      // Generate a JWT token
      const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '1h' });
      res.status(200).json({ token, user: user.username });
    } else {
      res.status(401).json({ error: 'Login failed' });
    }
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({ error: 'Error logging in' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});