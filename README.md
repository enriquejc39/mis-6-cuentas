# Mis 6 Cuentas

App web instalable (PWA) para dividir el ingreso mensual en 6 cuentas, inspirada en el método de cuentas para la libertad financiera.

## Qué incluye
- Modo **individual** o **familiar** (cada miembro con su perfil, ingreso y gastos, más un resumen familiar).
- Ingreso mensual en **CLP** (u otra moneda), distribución automática y edición por **porcentaje o monto**.
- Cuenta 1 que junta 4: gastos fijos, fondo de emergencia, fondo para inversiones y otras prioridades.
- Registro de gastos, **alertas** al acercarse o pasarse del límite, historial y comparación mes a mes.
- Recomendaciones según tus datos, tips de educación financiera y tutorial inicial.
- Español / inglés, tema claro u oscuro, contraseña local.
- Exportación a **Excel** (.xlsx), respaldo y restauración (.json), recordatorio para el calendario (.ics).

Los datos se guardan **solo en el dispositivo** (localStorage). Haz respaldos de vez en cuando.

## Porcentajes por defecto (editables)
| Cuenta | % |
|---|---|
| Gastos fijos | 35 |
| Fondo de emergencia | 5 |
| Fondo para inversiones | 5 |
| Otras prioridades | 5 |
| Gasto libre | 10 |
| Educación | 10 |
| Ocio y entretenimiento | 10 |
| Inversiones a largo plazo | 15 |
| Donaciones | 5 |

## Probar en el PC
```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1
```
Luego abre http://localhost:8080

## Instalar en el celular
Para instalarla como app (ícono en la pantalla de inicio y uso sin internet) debe estar publicada en una dirección **https**,
por ejemplo GitHub Pages o Netlify. Después:
- **Android (Chrome):** menú ⋮ → *Instalar app* / *Agregar a pantalla principal*.
- **iPhone (Safari):** botón Compartir → *Agregar a pantalla de inicio*.

## Publicar una versión nueva (sin que nadie pierda datos)
1. Sube `VERSION` en `sw.js` (por ejemplo `mis6cuentas-v6`) y `APP_VERSION` en `app.js` (por ejemplo `1.6`).
2. Haz commit y push a `main`; GitHub Pages publica en uno o dos minutos.
3. Quien ya tenga la app verá **"Hay una nueva versión de la app → Actualizar ahora"** (o puede ir a *Más → Buscar actualización*).

Los datos de cada persona viven en su propio celular, separados del código, así que actualizar nunca los borra.
Además, antes de cada actualización la app guarda una copia automática que se puede recuperar en *Más → Restaurar copia automática*.

**Ojo en iPhone:** la app instalada en la pantalla de inicio y Safari guardan datos por separado.
Para actualizar hay que abrir la app desde su ícono, no el enlace en Safari.

## Archivos
- `index.html` – página principal
- `app.js` – lógica y pantallas
- `i18n.js` – textos en español e inglés
- `styles.css` – estilos (responsivo, claro/oscuro)
- `sw.js`, `manifest.webmanifest`, `icons/` – instalación como app y uso sin conexión
- `serve.ps1` – servidor local de prueba
