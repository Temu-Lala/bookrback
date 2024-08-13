const express = require('express');
const { Pool, Client } = require('pg');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');

// Configuration for connecting to the PostgreSQL server
const clientConfig = {
    user: 'postgres',
    host: 'localhost',
    password: 'lala',
    port: 5432,
};

// Configuration for connecting to the specific database
const poolConfig = {
    ...clientConfig,
    database: 'book',
};

// Initialize the PostgreSQL pool
const pool = new Pool(poolConfig);

const app = express();
app.use(cors());
app.use(express.json());

// JWT secret key
const JWT_SECRET = 'lala_jwt_secret_key'; // Replace with a secure key

// Function to create the database if it doesn't exist
async function createDatabase() {
    const client = new Client(clientConfig);

    try {
        await client.connect();

        const dbCheckQuery = "SELECT 1 FROM pg_database WHERE datname = 'book'";
        const res = await client.query(dbCheckQuery);

        if (res.rowCount === 0) {
            await client.query('CREATE DATABASE book');
            console.log('Database created');
        } else {
            console.log('Database already exists');
        }
    } catch (err) {
        console.error('Error checking/creating database:', err);
    } finally {
        await client.end();
    }
}

// Function to create the users table if it doesn't exist
async function createUsersTable() {
    try {
        const tableCheckQuery = "SELECT 1 FROM pg_tables WHERE tablename = 'bookr'";
        const res = await pool.query(tableCheckQuery);

        if (res.rowCount === 0) {
            const createTableQuery = `
                CREATE TABLE bookr (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(100),
                    email VARCHAR(100),
                    location VARCHAR(100),
                    phone VARCHAR(15),
                    password VARCHAR(255), -- Increased length to accommodate hashed passwords
                    role VARCHAR(20) DEFAULT 'user' -- Default role is 'user'
                );
            `;
            await pool.query(createTableQuery);
            console.log('Users table created');
        } else {
            console.log('Users table already exists');
        }
    } catch (err) {
        console.error('Error checking/creating users table:', err);
    }
}

// Function to create the booksinfo table if it doesn't exist
async function createBooksTable() {
    try {
        const tableCheckQuery = "SELECT 1 FROM pg_tables WHERE tablename = 'booksinfo'";
        const res = await pool.query(tableCheckQuery);

        if (res.rowCount === 0) {
            const createTableQuery = `
            CREATE TABLE booksinfo (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255),
                genre VARCHAR(100),
                price DECIMAL(10, 2),
                imagePath VARCHAR(255),
                author VARCHAR(255),
                publicationdate DATE,
                publisher VARCHAR(255),
                description VARCHAR(10000),
                username VARCHAR(100),
                email VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            `;
            await pool.query(createTableQuery);
            console.log('Books table created');
        } else {
            console.log('Books table already exists');
        }
    } catch (err) {
        console.error('Error checking/creating books table:', err);
    }
}

// Call the functions to create the database and tables if they don't exist
createDatabase()
    .then(createUsersTable)
    .then(createBooksTable)
    .then(() => {
        // Start the server only after database and table checks are complete
        app.listen(3001, () => {
            console.log('Server is running on port 3001');
        });
    });

// Endpoint to handle user registration
app.post('/register', async (req, res) => {
    const { username, email, location, phone, password } = req.body;

    try {
        // Hash the password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Insert user into the database
        const sql = `
            INSERT INTO bookr (username, email, location, phone, password, role)
            VALUES ($1, $2, $3, $4, $5, 'user') RETURNING *; -- Default role is 'user'
        `;
        const values = [
            username,
            email,
            location,
            phone,
            hashedPassword,
        ];

        const data = await pool.query(sql, values);
        res.status(201).json(data.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error', details: err.message });
    }
});

// Endpoint to handle user login
app.post('/', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Find the user by email
        const userQuery = 'SELECT * FROM bookr WHERE email = $1';
        const userResult = await pool.query(userQuery, [email]);

        if (userResult.rowCount === 0) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = userResult.rows[0];

        // Check if the password is correct
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { username: user.username, email: user.email, role: user.role }, // Include role in payload
            JWT_SECRET,
            { expiresIn: '24h' } // Token expiration time
        );

        res.status(200).json({ token, role: user.role });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

// Endpoint to add a new book
app.post('/books', async (req, res) => {
    const { title, genre, price, imagePath, author, publicationdate, publisher, description } = req.body;

    try {
        const token = req.headers.authorization?.split(' ')[1]; // Extract token from Authorization header
        if (!token) return res.status(401).json({ error: 'Token is missing' });

        const decoded = jwt.verify(token, JWT_SECRET);
        const { username, email } = decoded; // Extract username and email from token

        const sql = `
            INSERT INTO booksinfo (title, genre, price, imagePath, author, publicationdate, publisher, description, username, email, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP) RETURNING *;
        `;
        const values = [
            title,
            genre,
            price,
            imagePath,
            author,
            publicationdate,
            publisher,
            description,
            username,
            email
        ];

        const data = await pool.query(sql, values);
        res.status(201).json(data.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error', details: err.message });
    }
});

// Endpoint to fetch all books
app.get('/books', async (req, res) => {
    try {
        const query = 'SELECT * FROM booksinfo';
        const result = await pool.query(query);
        res.status(201).json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch books' });
    }
});

// Endpoint to fetch a single book by ID
app.get('/books/:id', async (req, res) => {
    const { id } = req.params;
  
    try {
      const result = await pool.query('SELECT * FROM booksinfo WHERE id = $1', [id]);
  
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Book not found' });
      }
  
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error', details: err.message });
    }
});

// Endpoint to fetch all users
app.get('/users', async (req, res) => {
    try {
        const query = 'SELECT id, username, email, location, phone, role FROM bookr'; // Exclude password for security
        const result = await pool.query(query);
        
        res.status(201).json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch users', details: err.message });
    }
});





// Endpoint to update user role
app.put('/users/:id/role', async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;

    try {
        const sql = 'UPDATE bookr SET role = $1 WHERE id = $2 RETURNING *';
        const values = [role, id];
        const result = await pool.query(sql, values);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update user role', details: err.message });
    }
});

app.get('/booksusername', async (req, res) => {
    const { username } = req.query;

    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }

    try {
        const query = 'SELECT * FROM booksinfo WHERE username = $1';
        const result = await pool.query(query, [username]);

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'No books found for this user' });
        }

        res.status(201).json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch books', details: err.message });
    }
});


// Endpoint to get daily book counts
app.get('/books/daily', async (req, res) => {
    try {
        const query = `
            SELECT DATE(created_at) AS date, COUNT(*) AS count
            FROM booksinfo
            GROUP BY DATE(created_at)
            ORDER BY DATE(created_at);
        `;
        const result = await pool.query(query);
        res.status(201).json(result.rows);
    } catch (err) {
        console.error('Error fetching daily book counts:', err);
        res.status(500).json({ error: 'Failed to fetch daily book counts', details: err.message });
    }
});



// Endpoint to search books by title
app.get('/search', async (req, res) => {
    const { title } = req.query;

    try {
        const sql = 'SELECT * FROM booksinfo WHERE LOWER(title) LIKE LOWER($1)';
        const values = [`%${title}%`]; // Wildcard search

        const result = await pool.query(sql, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No books found' });
        }

        res.status(201).json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to search books', details: err.message });
    }
});