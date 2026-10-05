<p align="center">
  <img src="logo.png" alt="Prompter" width="120">
</p>

<h1 align="center">Prompter</h1>

<p align="center">Teleprompter con cuentas de usuario. Cada persona gestiona sus propios guiones; los datos viven en una base de datos propia, no en el navegador.</p>

## Funciones

- Cuentas de usuario (registro e inicio de sesión); cada quien ve y gestiona solo sus guiones
- Scroll automático con velocidad y tamaño de texto ajustables
- Biblioteca de guiones (crear, editar, eliminar) guardada en SQLite vía una API propia
- Grabación de cámara y micrófono mientras lees el guion
- Espejo de texto para rigs con cristal teleprompter
- Instalable como app (PWA)

## Arquitectura

- **Frontend**: HTML/CSS/JS sin dependencias ni build.
- **Backend**: API en FastAPI (`backend/`) con SQLite. Autenticación con contraseñas cifradas (bcrypt) y sesión por token (JWT); cada guion pertenece a un usuario y solo él puede leerlo, editarlo o borrarlo. El contenido vive solo en la base de datos local, nunca en el repositorio.

## Uso local

Backend (puerto 8420):

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8420
```

Frontend, solo en `localhost` (puerto 5500):

```bash
python3 -m http.server 5500
```

Abre `http://localhost:5500` y crea una cuenta desde la propia app.

> El frontend busca la API en el puerto 8420 del mismo host desde el que se accede a la página.
> La primera cuenta que se registre hereda automáticamente los guiones que hubiera antes de tener usuarios (si los hay).

### Acceso desde el móvil / otros dispositivos de la red

La cámara (`getUserMedia`) solo funciona en un contexto seguro: `localhost` o HTTPS.
Si accedes desde otro dispositivo por la IP del host (no `localhost`), necesitas HTTPS.

1. Genera un certificado autofirmado una vez (cambia la IP por la tuya):

   ```bash
   mkdir -p certs
   openssl req -x509 -nodes -newkey rsa:2048 \
     -keyout certs/key.pem -out certs/cert.pem -days 825 \
     -subj "/CN=prompter.local" \
     -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:TU_IP_LOCAL"
   ```

2. Arranca el backend con TLS:

   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8420 --ssl-keyfile ../certs/key.pem --ssl-certfile ../certs/cert.pem
   ```

3. Arranca el frontend con TLS (sirve el mismo certificado):

   ```bash
   python3 serve_https.py 8090
   ```

4. Desde el otro dispositivo, entra a `https://TU_IP_LOCAL:8090` y acepta el aviso de certificado no confiado (es autofirmado, esperable en red local).
