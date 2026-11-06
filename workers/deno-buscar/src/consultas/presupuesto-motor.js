// Límites por instancia; el despliegue con varias réplicas no comparte cuota.
export function crearPresupuestoMotor({ ahora, dormir }) {
  const proveedores = new Map();
  return async (proveedor, tarea) => {
    if (!['openf1', 'motogp', 'euroliga'].includes(proveedor)) return tarea();
    if (!proveedores.has(proveedor)) proveedores.set(proveedor, { cola: Promise.resolve(), pendientes: 0, ultima: -Infinity });
    const p = proveedores.get(proveedor);
    if (p.pendientes >= 6) throw new Error(`Presupuesto de ${proveedor} ocupado`);
    p.pendientes++;
    const trabajo = p.cola.then(async () => {
      // 2,1 segundos dejan margen a las 30 peticiones/minuto de OpenF1.
      const espera = p.ultima + (proveedor === 'openf1' ? 2100 : 1000) - ahora();
      if (espera > 0) await dormir(espera);
      p.ultima = ahora();
      return tarea();
    });
    p.cola = trabajo.catch(() => {});
    try { return await trabajo; } finally { p.pendientes--; }
  };
}
