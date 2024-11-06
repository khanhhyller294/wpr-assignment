const mysql = require('mysql2');

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'wpr',
  password: 'fit2024',
  port: 3306
});

const dbName = 'wpr2201140110'; 

const setupDatabase = async () => {
  await connection.promise().query(`CREATE DATABASE IF NOT EXISTS ${dbName}`);
  await connection.promise().query(`USE ${dbName}`);

  await connection.promise().query(`DROP TABLE IF EXISTS emails`);
  await connection.promise().query(`DROP TABLE IF EXISTS users`);

  await connection.promise().query(`
    CREATE TABLE users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      email VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(100) NOT NULL,
      full_name VARCHAR(100) NOT NULL
    )
  `);

  await connection.promise().query(`
    CREATE TABLE emails (
      id INT PRIMARY KEY AUTO_INCREMENT,
      sender_id INT,
      receiver_id INT,
      subject VARCHAR(255),
      body TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      attachment VARCHAR(255),
      FOREIGN KEY (sender_id) REFERENCES users(id),
      FOREIGN KEY (receiver_id) REFERENCES users(id)
    )
  `);

  await connection.promise().query(`
    INSERT INTO users (email, password, full_name) VALUES
    ('a@a.com', '123', 'User A'),
    ('b@b.com', '123', 'User B'),
    ('c@c.com', '123', 'User C')
  `);

  await connection.promise().query(`
    INSERT INTO emails (sender_id, receiver_id, subject, body)
    VALUES
    (1, 2, 'Hello', 'Hello B, this is A.'),
    (2, 1, 'Re: Hello', 'Hello A, nice to hear from you.'),
    (1, 3, 'Hello C', 'This is A sending a message to C'),
    (3, 1, 'Re: Hello C', 'Hi A, thanks for the email.')
  `);

  console.log("Database setup complete.");
  connection.end();
};

setupDatabase();
