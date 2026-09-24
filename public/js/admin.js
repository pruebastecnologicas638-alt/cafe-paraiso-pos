document.addEventListener('DOMContentLoaded', () => {
    loadCajaStatus();
    loadActiveOrders();
    // Actualizar pedidos automáticamente cada 5 segundos
    setInterval(loadActiveOrders, 5000);
});

async function loadCajaStatus() {
    try {
        const res = await fetch('/api/caja/estado');
        const data = await res.json();
        const badge = document.getElementById('cajaStatusBadge');
        const actionArea = document.getElementById('cajaActionArea');

        if (data.abierta) {
            badge.innerText = 'Caja: ABIERTA';
            badge.style.backgroundColor = '#2ecc71';
            const montoInicial = data.caja.monto_inicial ? parseFloat(data.caja.monto_inicial) : 0;
            actionArea.innerHTML = `
                <p>Monto Inicial: <strong>$${montoInicial.toLocaleString()}</strong></p>
                <br>
                <button class="btn-pagar" style="background:#5c3d2e; width:100%;" onclick="cerrarCaja(${data.caja.id})">Cerrar Caja del Día</button>
            `;
        } else {
            badge.innerText = 'Caja: CERRADA';
            badge.style.backgroundColor = '#e74c3c';
            actionArea.innerHTML = `
                <label>Monto Inicial de Apertura:</label><br><br>
                <input type="number" id="montoInicialInput" value="0" style="width:90%; padding:8px; margin-bottom:10px;"><br>
                <button class="btn-pagar" style="width:100%;" onclick="abrirCaja()">Abrir Caja</button>
            `;
        }
    } catch (e) {
        console.error('Error cargando estado de caja:', e);
    }
}

async function loadActiveOrders() {
    try {
        const res = await fetch('/api/admin/pedidos');
        const pedidos = await res.json();
        const grid = document.getElementById('adminOrdersGrid');

        if (!pedidos || pedidos.length === 0) {
            grid.innerHTML = '<p>No hay pedidos pendientes en este momento.</p>';
            return;
        }

        grid.innerHTML = '';
        pedidos.forEach(p => {
            const estadoNorm = (p.estado || 'pendiente').toLowerCase();
            const itemsHtml = (p.detalles || []).map(i => `
                <li>
                    <span>${i.cantidad}x ${i.nombre}</span>
                    <span>$${parseFloat(i.precio_unitario).toLocaleString()}</span>
                </li>
            `).join('');

            grid.innerHTML += `
                <div class="card-pedido">
                    <div class="card-header">
                        <span>Pedido #${p.id} - Mesa ${p.mesa_numero}</span>
                        <span class="tag-estado">${estadoNorm.toUpperCase()}</span>
                    </div>
                    <ul class="items-list">
                        ${itemsHtml}
                    </ul>
                    <div class="card-footer">
                        <strong>Total: $${parseFloat(p.total).toLocaleString()}</strong>
                        <button class="btn-pagar" onclick="cambiarEstadoPedido(${p.id}, 'completado')">✓ Pagado</button>
                    </div>
                </div>
            `;
        });
    } catch (e) {
        console.error('Error cargando pedidos:', e);
    }
}

async function cambiarEstadoPedido(pedidoId, nuevoEstado) {
    try {
        const res = await fetch(`/api/admin/pedidos/${pedidoId}/estado`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: nuevoEstado })
        });

        if (res.ok) {
            loadActiveOrders();
        } else {
            alert('Error al actualizar el estado del pedido');
        }
    } catch (e) {
        console.error('Error al cambiar estado:', e);
    }
}
async function cargarQRMesas() {
    try {
        const response = await fetch('/api/mesas/qr');
        const result = await response.json();

        if (result.success) {
            const contenedor = document.getElementById('contenedor-qr-mesas');
            if (!contenedor) return;
            
            contenedor.innerHTML = '';

            result.data.forEach(mesa => {
                contenedor.innerHTML += `
                    <div class="col-md-3 col-sm-6 mb-3">
                        <div class="card text-center p-3 shadow-sm border rounded">
                            <h5 class="fw-bold">${mesa.numero}</h5>
                            <img src="${mesa.qrImage}" alt="QR ${mesa.numero}" class="img-fluid my-2 border p-2 bg-white rounded" style="max-width: 180px; margin: 0 auto;">
                            <a href="${mesa.qrImage}" download="QR_${mesa.numero}.png" class="btn btn-sm btn-outline-primary mt-2">
                                Descargar QR
                            </a>
                        </div>
                    </div>
                `;
            });
        }
    } catch (error) {
        console.error('Error al cargar los códigos QR:', error);
    }
}

// Cargar los QR automáticamente al abrir la página
document.addEventListener('DOMContentLoaded', cargarQRMesas);