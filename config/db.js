const mysql = require('mysql2');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'mysql-23304375-pruebastecnologicas638-aaf3.k.aivencloud.com',
    user: process.env.DB_USER || 'avnadmin',
    password: process.env.DB_PASSWORD || 'AVNS_L9YyfwQxKGhrp5yPcmN',
    database: process.env.DB_NAME || 'defaultdb', // Usamos defaultdb por defecto
    port: process.env.DB_PORT || 17288,
    ssl: {
        rejectUnauthorized: false
    }
});

module.exports = pool.promise();

