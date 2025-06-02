// server.js

const express = require('express');
const { MongoClient } = require('mongodb');
const app = express();
const port = process.env.PORT || 3000;

const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017'; // Default for local machine if not set by Docker env
const dbName = 'voiceowl';
const employeesCollectionName = 'employees'; // Collection for VoiceOwl employees
const companyListCollectionName = 'company_list'; // Separate collection for general company list

let db; // To hold the connected database instance

// Connect to MongoDB
async function connectToMongo() {
    try {
        const client = new MongoClient(mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        await client.connect();
        db = client.db(dbName);
        console.log(`Connected to MongoDB: ${mongoUri}/${dbName}`);

        // Optional: Seed initial employee data if employees collection is empty
        const employeesCollection = db.collection(employeesCollectionName);
        const count = await employeesCollection.countDocuments();
        if (count === 0) {
            console.log('Seeding initial VoiceOwl employee data...');
            await employeesCollection.insertMany([
                { name: 'Charlie Brown', email: 'charlie.b@voiceowl.com', department: 'HR' },
                { name: 'Diana Prince', email: 'diana.p@voiceowl.com', department: 'Sales' }
            ]);
            console.log('Initial VoiceOwl employee data seeded.');
            // Also add to company_list if seeding employees
            await db.collection(companyListCollectionName).insertMany([
                { name: 'Charlie Brown', addedAt: new Date() },
                { name: 'Diana Prince', addedAt: new Date() },
            ]);
            console.log('Initial company_list data seeded.');
        }

    } catch (err) {
        console.error('Failed to connect to MongoDB', err);
        // It's critical for this service to connect to DB, so exit if it fails
        process.exit(1);
    }
}

// Immediately try to connect to MongoDB
connectToMongo();

// Middleware to parse JSON bodies
app.use(express.json());

// Basic health check endpoint
app.get('/health', (req, res) => {
    if (db) {
        res.status(200).send('OK (MongoDB Connected)');
    } else {
        res.status(503).send('Service Unavailable: MongoDB not connected');
    }
});

// Greeting endpoint
app.get('/greet', (req, res) => {
    const name = req.query.name || 'World';
    res.json({ message: `Hello, ${name}!` });
});

// Endpoint to add a new VoiceOwl employee
app.post('/employees', async (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not connected' });
    }
    const { name, email, department } = req.body;

    if (!name || !email) {
        return res.status(400).json({ error: 'Name and email are required.' });
    }

    try {
        const employeesCollection = db.collection(employeesCollectionName);
        const newEmployee = { name, email, department, addedDate: new Date() };
        const result = await employeesCollection.insertOne(newEmployee);

        if (result.acknowledged) {
            console.log(`Added employee: ${name} to ${employeesCollectionName}`);

            // Automatically add to company_list collection
            const companyListCollection = db.collection(companyListCollectionName);
            const companyListEntry = { name, addedAt: new Date() };
            await companyListCollection.insertOne(companyListEntry);
            console.log(`Added employee: ${name} to ${companyListCollectionName}`);

            res.status(201).json({
                message: 'Employee added successfully and synced to company list.',
                employee: { _id: result.insertedId, ...newEmployee }
            });
        } else {
            res.status(500).json({ error: 'Failed to add employee.' });
        }
    } catch (err) {
        console.error('Error adding employee:', err);
        res.status(500).json({ error: 'Failed to add employee due to server error.' });
    }
});


// Endpoint to list all VoiceOwl employees
app.get('/employees', async (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not connected' });
    }
    try {
        const employees = await db.collection(employeesCollectionName).find({}).toArray();
        res.json(employees);
    } catch (err) {
        console.error('Error fetching employees:', err);
        res.status(500).json({ error: 'Failed to retrieve employee data' });
    }
});

// New endpoint to list all users in the general company list
app.get('/company-list', async (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not connected' });
    }
    try {
        const companyUsers = await db.collection(companyListCollectionName).find({}).toArray();
        res.json(companyUsers);
    } catch (err) {
        console.error('Error fetching company list:', err);
        res.status(500).json({ error: 'Failed to retrieve company list data' });
    }
});


// Start the server
const server = app.listen(port, () => {
    console.log(`Employee Management Service listening on port ${port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        if (db) {
            db.client.close();
            console.log('MongoDB connection closed.');
        }
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        if (db) {
            db.client.close();
            console.log('MongoDB connection closed.');
        }
        process.exit(0);
    });
});
