const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const db = require('./config/db');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const HOST_URL = process.env.BASE_URL || 'https://cafe-paraiso-pos.onrender.com';

// Ruta de prueba
app.get('/api/health', async (req, res) => {
    try {
        const [categorias] = await db.query('SELECT COUNT(*) as total FROM categorias');
        const [productos] = await db.query('SELECT COUNT(*) as total FROM productos');
        res.json({
            status: 'OK',
            database: 'Conectado a MySQL',
            totalCategorias: categorias[0].total,
            totalProductos: productos[0].total
        });
    } catch (error) {
        res.status(500).json({ status: 'Error', error: error.message });
    }
});

// Ruta para poblar la base de datos en Aiven fácilmente
app.get('/api/setup-db', async (req, res) => {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS productos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                precio DECIMAL(10,2) NOT NULL,
                categoria VARCHAR(50) NOT NULL,
                imagen VARCHAR(255),
                disponible BOOLEAN DEFAULT TRUE
            );
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS categorias (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nombre VARCHAR(50) NOT NULL,
                slug VARCHAR(50) NOT NULL
            );
        `);

        await db.query(`TRUNCATE TABLE productos;`);
        await db.query(`TRUNCATE TABLE categorias;`);

        // Insertar categorías estándar
        await db.query(`
            INSERT INTO categorias (nombre, slug) VALUES 
            ('Cafés & Bebidas', 'cafes'),
            ('Acompañantes', 'acompanantes');
        `);

        // Insertar productos asignando la categoría en minúsculas y sin acentos
        await db.query(`
            INSERT INTO productos (nombre, precio, categoria, imagen, disponible) VALUES 
            ('Espresso', 4500, 'cafes', '/img/espresso.jpg', TRUE),
            ('Capuchino', 6000, 'cafes', '/img/capuchino.jpg', TRUE),
            ('Latte', 6500, 'cafes', '/img/late.jpg', TRUE),
            ('Croissant', 5000, 'acompanantes', '/img/croissant.jpg', TRUE),
            ('Empanada', 3000, 'acompanantes', '/img/empanada.jpg', TRUE);
        `);

        res.send('✅ Categorías y productos sincronizados correctamente.');
    } catch (e) {
        console.error('Error en setup-db:', e);
        res.status(500).json({ error: e.message });
    }
});

// Obtener Mesas
app.get('/api/mesas', async (req, res) => {
    try {
        const [mesas] = await db.query('SELECT * FROM mesas ORDER BY id ASC');
        res.json(mesas);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Obtener Categorías
app.get('/api/categorias', async (req, res) => {
    try {
        const [categorias] = await db.query('SELECT * FROM categorias');
        res.json(categorias);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Obtener Productos (Error err arreglado a e)
app.get('/api/productos', async (req, res) => {
    try {
        const [productos] = await db.query('SELECT * FROM productos WHERE disponible = TRUE');
        res.json(productos);
    } catch (e) {
        console.error('Error al consultar productos en MySQL:', e);
        res.status(500).json({ error: e.message });
    }
});

// Crear un nuevo Pedido (Cliente)
app.post('/api/pedidos', async (req, res) => {
    const { mesa_numero, items, total } = req.body;
    try {
        const [mesas] = await db.query('SELECT id FROM mesas WHERE numero = ?', [mesa_numero]);
        if (mesas.length === 0) return res.status(404).json({ error: 'Mesa no encontrada' });
        const mesa_id = mesas[0].id;

        const [cajas] = await db.query("SELECT id FROM cajas WHERE estado = 'abierta' LIMIT 1");
        if (cajas.length === 0) return res.status(400).json({ error: 'No hay ninguna caja abierta en este momento.' });
        const caja_id = cajas[0].id;

        const [result] = await db.query(
            'INSERT INTO pedidos (mesa_id, caja_id, estado, total) VALUES (?, ?, "pendiente", ?)',
            [mesa_id, caja_id, total]
        );
        const pedido_id = result.insertId;

        for (const item of items) {
            await db.query(
                'INSERT INTO pedido_detalles (pedido_id, producto_id, cantidad, precio_unitario) VALUES (?, ?, ?, ?)',
                [pedido_id, item.id, item.cantidad, item.precio]
            );
        }

        await db.query("UPDATE mesas SET estado = 'ocupada' WHERE id = ?", [mesa_id]);
        io.emit('nuevo_pedido', { pedido_id, mesa_numero, total });

        res.json({ status: 'OK', pedido_id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Estado de Caja
app.get('/api/caja/estado', async (req, res) => {
    try {
        const [cajas] = await db.query("SELECT * FROM cajas WHERE estado = 'abierta' ORDER BY id DESC LIMIT 1");
        if (cajas.length > 0) {
            res.json({ abierta: true, caja: cajas[0] });
        } else {
            res.json({ abierta: false });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Abrir Caja
app.post('/api/caja/abrir', async (req, res) => {
    const { monto_inicial, usuario_id } = req.body;
    try {
        await db.query("INSERT INTO cajas (usuario_id, monto_inicial, estado) VALUES (?, ?, 'abierta')", [usuario_id || 1, monto_inicial || 0]);
        res.json({ status: 'OK' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Cerrar Caja
app.post('/api/caja/cerrar', async (req, res) => {
    const { caja_id } = req.body;
    try {
        await db.query("UPDATE cajas SET estado = 'cerrada', fecha_cierre = NOW() WHERE id = ?", [caja_id]);
        res.json({ status: 'OK' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Pedidos para Admin
app.get('/api/admin/pedidos', async (req, res) => {
    try {
        const [pedidos] = await db.query(`
            SELECT p.id, p.estado, p.total, p.fecha, m.numero as mesa_numero 
            FROM pedidos p 
            JOIN mesas m ON p.mesa_id = m.id 
            WHERE p.estado != 'cancelado' 
            ORDER BY p.id DESC
        `);

        for (let p of pedidos) {
            const [detalles] = await db.query(`
                SELECT pd.cantidad, pd.precio_unitario, prod.nombre 
                FROM pedido_detalles pd 
                JOIN productos prod ON pd.producto_id = prod.id 
                WHERE pd.pedido_id = ?
            `, [p.id]);
            p.detalles = detalles;
        }

        res.json(pedidos);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Actualizar Estado de Pedido
app.put('/api/admin/pedidos/:id/estado', async (req, res) => {
    const { id } = req.params;
    const { estado } = req.body;
    try {
        await db.query('UPDATE pedidos SET estado = ? WHERE id = ?', [estado, id]);

        if (estado === 'completado' || estado === 'cancelado') {
            const [pedidos] = await db.query('SELECT mesa_id FROM pedidos WHERE id = ?', [id]);
            if (pedidos.length > 0) {
                await db.query("UPDATE mesas SET estado = 'disponible' WHERE id = ?", [pedidos[0].mesa_id]);
            }
        }

        res.json({ status: 'OK' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// QR de Mesas
app.get('/api/mesas/qr', async (req, res) => {
    try {
        const mesas = [
            { id: 1, numero: 'Mesa 1' },
            { id: 2, numero: 'Mesa 2' },
            { id: 3, numero: 'Mesa 3' }
        ];

        const mesasConQR = await Promise.all(
            mesas.map(async (mesa) => {
                const urlMenu = `${HOST_URL}/index.html?mesa=${mesa.id}`;
                const qrImage = await QRCode.toDataURL(urlMenu, { width: 250, margin: 2 });
                return { ...mesa, url: urlMenu, qrImage };
            })
        );

        res.json({ success: true, data: mesasConQR });
    } catch (error) {
        console.error('Error al generar QR:', error);
        res.status(500).json({ success: false, error: 'Error al generar los códigos QR' });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});