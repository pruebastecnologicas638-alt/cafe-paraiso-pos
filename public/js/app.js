const socket = typeof io !== 'undefined' ? io() : null;

let currentMesaNumero = null;
let cart = [];
let categories = [];
let allProducts = [];
let selectedCategoryId = 'todas';

// Diccionario de imágenes atractivas de alta calidad desde Unsplash
const imagenesPorDefecto = {
    'espresso': 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?auto=format&fit=crop&w=600&q=80',
    'late': 'https://images.unsplash.com/photo-1534778101976-62847782c213?auto=format&fit=crop&w=600&q=80',
    'capuchino': 'https://images.unsplash.com/photo-1572442388796-11668602093a?auto=format&fit=crop&w=600&q=80',
    'mocachino': 'https://images.unsplash.com/photo-1578314675249-a6910f80cc4e?auto=format&fit=crop&w=600&q=80',
    'frapuchino': 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=600&q=80',
    'malteada': 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=600&q=80',
    'affogato': 'https://images.unsplash.com/photo-1592663527359-cf6642f54cff?auto=format&fit=crop&w=600&q=80',
    'soda': 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80',
    'empanada': '/img/empanadas_anejo.jpg',
    'croissant': 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=600&q=80',
    'buñuelo': 'https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?auto=format&fit=crop&w=600&q=80',
    'almojábana': 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=80',
    'dedo': 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80'
};

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    // Detectar mesa desde la URL (?mesa=1)
    const urlParams = new URLSearchParams(window.location.search);
    const mesaParam = urlParams.get('mesa');
    if (mesaParam) {
        setMesa(mesaParam);
    } else {
        setMesa('1'); // Mesa 1 por defecto
    }

    await fetchProductos();
}

function setMesa(numero) {
    currentMesaNumero = numero;
    const badge = document.getElementById('mesaInfoBadge');
    if (badge) {
        badge.innerText = `Mesa: ${numero}`;
    }
}

async function fetchProductos() {
    try {
        const res = await fetch('/api/productos');
        allProducts = await res.json();
        renderProducts(allProducts);
    } catch (e) {
        console.error('Error al cargar productos:', e);
    }
}

function obtenerImagenProducto(producto) {
    if (producto.imagen && (producto.imagen.startsWith('http://') || producto.imagen.startsWith('https://'))) {
        return producto.imagen;
    }

    const nombreLower = (producto.nombre || '').toLowerCase();
    for (const key in imagenesPorDefecto) {
        if (nombreLower.includes(key)) {
            return imagenesPorDefecto[key];
        }
    }

    return 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=600&q=80';
}

function renderProducts(productsToRender) {
    const container = document.getElementById('productsContainer') || document.getElementById('productosGrid');
    if (!container) return;

    const list = productsToRender || allProducts;

    if (!list || list.length === 0) {
        container.innerHTML = '<p style="text-align:center; grid-column: 1/-1; color:#808e9b; padding:20px;">No hay productos disponibles.</p>';
        return;
    }

    container.innerHTML = list.map(p => {
        const imgUrl = obtenerImagenProducto(p);
        
        return `
            <div class="product-card">
                <div class="product-image-wrapper">
                    <img src="${imgUrl}" alt="${p.nombre}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1572442388796-11668602093a?auto=format&fit=crop&w=600&q=80'">
                    <span class="product-price-tag">$${parseFloat(p.precio).toLocaleString()}</span>
                </div>
                <div class="product-info">
                    <div>
                        <h3 class="product-title">${p.nombre}</h3>
                        <p class="product-description">${p.descripcion || 'Delicioso producto preparado al instante.'}</p>
                    </div>
                    <button class="btn-add-product" onclick="agregarAlCarrito(${p.id}, '${p.nombre}', ${p.precio})">
                        <i class="fa-solid fa-plus"></i> Agregar al Pedido
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Función conectada a los botones de categorías (Pills)
// Función conectada a los botones de categorías (Pills)
window.filtrarCategoria = function(catId) {
    // Actualizar clase activa en los botones de la interfaz
    const buttons = document.querySelectorAll('.category-pill');
    buttons.forEach(btn => btn.classList.remove('active'));
    
    if (typeof event !== 'undefined' && event && event.target) {
        event.target.classList.add('active');
    }

    // Si el filtro es "todas", mostrar todo el catálogo
    if (!catId || catId === 'todas' || catId === 'all') {
        renderProducts(allProducts);
        return;
    }

    // Filtrar de forma flexible (compara id numérico, texto de categoría o slug)
    const filtrados = allProducts.filter(p => {
        const idCoincide = p.categoria_id == catId;
        const nombreCoincide = p.categoria && p.categoria.toLowerCase() === String(catId).toLowerCase();
        return idCoincide || nombreCoincide;
    });

    renderProducts(filtrados);
};

window.agregarAlCarrito = function(id, nombre, precio) {
    const itemExistente = cart.find(item => item.id === id);
    if (itemExistente) {
        itemExistente.cantidad++;
    } else {
        cart.push({ id, nombre, precio: parseFloat(precio), cantidad: 1 });
    }
    actualizarBadgesCarrito();
};

function actualizarBadgesCarrito() {
    const totalCount = cart.reduce((acc, item) => acc + item.cantidad, 0);
    const badge = document.getElementById('cartCountBadge');
    if (badge) {
        badge.innerText = totalCount;
    }
}

window.abrirCarrito = function() {
    if (cart.length === 0) {
        alert('El carrito está vacío. Agrega algunos productos.');
        return;
    }
    
    let resumen = 'Tu Pedido:\n';
    let total = 0;
    cart.forEach(i => {
        const subtotal = i.cantidad * i.precio;
        total += subtotal;
        resumen += `- ${i.cantidad}x ${i.nombre} ($${subtotal.toLocaleString()})\n`;
    });
    resumen += `\nTotal: $${total.toLocaleString()}\n\n¿Deseas confirmar y enviar el pedido?`;

    if (confirm(resumen)) {
        enviarPedidoServidor(total);
    }
};

async function enviarPedidoServidor(total) {
    try {
        const res = await fetch('/api/pedidos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mesa_numero: currentMesaNumero,
                items: cart,
                total: total
            })
        });

        if (res.ok) {
            alert('¡Pedido enviado a la cocina con éxito!');
            cart = [];
            actualizarBadgesCarrito();
        } else {
            alert('Error al enviar el pedido. Intenta de nuevo.');
        }
    } catch (e) {
        console.error('Error enviando pedido:', e);
        alert('Error de conexión al servidor.');
    }
}