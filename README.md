# Dylan Studio

Sitio web multipágina para un estudio creativo especializado en branding, packaging, diseño web y administración web. Incluye un formulario de solicitudes, contenido dinámico de ofertas y un panel administrativo.

## Tecnologías

- HTML5, CSS3 y JavaScript
- jQuery 3.7.1 únicamente en el panel administrativo
- Node.js y Express
- SQL Server mediante `mssql` y `msnodesqlv8`

## Estructura

```text
admin/     Panel de solicitudes
assets/    Imágenes e identidad visual
css/       Estilos globales
js/        Comportamiento del sitio
pages/     Páginas internas
server/    API Express y conexión con SQL Server
```

## Requisitos

- Node.js 18 o superior
- SQL Server local
- ODBC Driver 18 for SQL Server
- Base de datos `dylan_studio_db` con las tablas usadas por la API

## Instalación

Primero ejecuta [`server/sql/security.sql`](server/sql/security.sql) en SQL Server Management Studio sobre la instancia que contiene `dylan_studio_db`. El script crea los procedimientos almacenados y los roles de mínimo privilegio que necesita la API.

Instala las dependencias del backend:

```bash
cd server
npm install
```

Inicia la API:

```powershell
$env:ADMIN_USER="tu_usuario"
$env:ADMIN_PASSWORD="una_contraseña_segura_de_12_o_más_caracteres"
npm start
```

La API estará disponible por defecto en `http://localhost:3001/api`. Abre el frontend con un servidor estático para que los formularios y enlaces funcionen correctamente.

## Seguridad y conexión SQL

La API admite dos conexiones independientes:

- `DB_PUBLIC_CONNECTION_STRING`: formulario público, ofertas y noticias.
- `DB_ADMIN_CONNECTION_STRING`: lectura, actualización y eliminación desde el panel.

En desarrollo ambas usan por defecto la conexión de Windows local. Para producción, crea dos identidades diferentes, asígnalas respectivamente a `web_public_role` y `web_admin_role`, y configura las cadenas mediante variables de entorno. Ninguna identidad recibe acceso directo a las tablas; solo puede ejecutar los procedimientos autorizados.

También puedes configurar los orígenes web permitidos, separados por comas:

```powershell
$env:ALLOWED_ORIGINS="https://www.ejemplo.com,https://ejemplo.com"
```

Si la API se publica detrás de un proxy inverso de confianza, configura además `TRUST_PROXY=1` para que los límites por IP utilicen la dirección correcta del visitante.

No publiques cadenas de conexión ni contraseñas en el repositorio.

## Configuración del frontend

El frontend usa `http://localhost:3001/api` como dirección predeterminada. Para apuntarlo a otro servidor, define `window.DYLAN_API_URL` antes de cargar los scripts del sitio:

```html
<script>
  window.DYLAN_API_URL = "https://api.ejemplo.com/api";
</script>
```

## API principal

- `GET /api/health`
- `GET /api/solicitudes`
- `POST /api/solicitudes`
- `PUT /api/solicitudes/:id/estado`
- `DELETE /api/solicitudes/:id`
- `GET /api/ofertas`

## Nota de seguridad

Las credenciales administrativas no se guardan en el repositorio. Debes proporcionar `ADMIN_USER` y `ADMIN_PASSWORD` mediante variables de entorno antes de iniciar la API; la contraseña debe tener al menos 12 caracteres. Al iniciar sesión, la API genera un token aleatorio con duración de ocho horas. Ese token es obligatorio para listar, actualizar o eliminar solicitudes y se invalida al cerrar sesión o al expirar.

El formulario público valida tipos y longitudes, limita el cuerpo JSON a 10 KB y permite un máximo de cinco envíos cada quince minutos por dirección IP. La API también restringe CORS, oculta errores internos y aplica headers de seguridad.

## Autor

Dylan Moreno
