const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const db = require('./config/db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

const PORT = 3000;
server.listen(PORT, () => {
    console.log(` Servidor corriendo en http://localhost:${PORT}`);
});
// Obtener Mesas
app.get('/api/mesas', async (req, res) => {
    try {
        const [mesas] = await db.query('SELECT * FROM mesas ORDER BY numero ASC');
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

// Obtener Productos
app.get('/api/productos', async (req, res) => {
    try {
        const [productos] = await db.query('SELECT * FROM productos WHERE disponible = TRUE');
        res.json(productos);
    } catch (e) {
        console.error('Error al consultar productos en MySQL:', err); // <-- AGREGA ESTA LÍNEA
        res.status(500).json({ error: e.message });
    }
});

// Crear un nuevo Pedido (Cliente)
app.post('/api/pedidos', async (req, res) => {
    const { mesa_numero, items, total } = req.body;
    try {
        // Obtener ID de Mesa
        const [mesas] = await db.query('SELECT id FROM mesas WHERE numero = ?', [mesa_numero]);
        if (mesas.length === 0) return res.status(404).json({ error: 'Mesa no encontrada' });
        const mesa_id = mesas[0].id;

        // Obtener Caja Abierta actual
        const [cajas] = await db.query("SELECT id FROM cajas WHERE estado = 'abierta' LIMIT 1");
        if (cajas.length === 0) return res.status(400).json({ error: 'No hay ninguna caja abierta en este momento.' });
        const caja_id = cajas[0].id;

        // Insertar Pedido
        const [result] = await db.query(
            'INSERT INTO pedidos (mesa_id, caja_id, estado, total) VALUES (?, ?, "pendiente", ?)',
            [mesa_id, caja_id, total]
        );
        const pedido_id = result.insertId;

        // Insertar Detalles
        for (const item of items) {
            await db.query(
                'INSERT INTO pedido_detalles (pedido_id, producto_id, cantidad, precio_unitario) VALUES (?, ?, ?, ?)',
                [pedido_id, item.id, item.cantidad, item.precio]
            );
        }

        // Actualizar estado de la mesa
        await db.query("UPDATE mesas SET estado = 'ocupada' WHERE id = ?", [mesa_id]);

        // Notificar en tiempo real por WebSockets
        io.emit('nuevo_pedido', { pedido_id, mesa_numero, total });

        res.json({ status: 'OK', pedido_id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// Obtener Estado de Caja Activa
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

// Obtener Pedidos para Admin/Caja
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

// Actualizar Estado del Pedido
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
// 1. Requerir la librería al inicio del archivo
const QRCode = require('qrcode');

// 2. Colocar la IP de tu PC para las pruebas desde el celular
// Puedes ver tu IP ejecutando 'ipconfig' en la terminal (ejemplo: 192.168.1.15)
const HOST_URL = process.env.BASE_URL || 'http://192.168.1.15:3000';

// 3. Crear la ruta para consultar/generar los QR de las mesas
app.get('/api/mesas/qr', async (req, res) => {
    try {
        const mesas = [
            { id: 1, numero: 'Mesa 1' },
            { id: 2, numero: 'Mesa 2' },
            { id: 3, numero: 'Mesa 3' },
            { id: 4, numero: 'Mesa 4' },
            { id: 5, numero: 'Mesa 5' }
        ];

        const mesasConQR = await Promise.all(
            mesas.map(async (mesa) => {
                const urlMenu = `${HOST_URL}/index.html?mesa=${mesa.id}`;
                const qrImage = await QRCode.toDataURL(urlMenu, {
                    width: 250,
                    margin: 2
                });
                return { ...mesa, url: urlMenu, qrImage };
            })
        );

        res.json({ success: true, data: mesasConQR });
    } catch (error) {
        console.error('Error al generar QR:', error);
        res.status(500).json({ success: false, error: 'Error al generar los códigos QR' });
    }
});