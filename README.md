<p align="center">
  <img src="logo.png" alt="Prompter" width="120">
</p>

<h1 align="center">Prompter</h1>

<p align="center">Teleprompter ligero con grabación de cámara integrada. Los guiones se guardan en una base de datos propia, no en el navegador.</p>

## Funciones

- Scroll automático con velocidad y tamaño de texto ajustables
- Biblioteca de guiones (crear, editar, eliminar) guardada en SQLite vía una API propia
- Grabación de cámara y micrófono mientras lees el guion
- Espejo de texto para rigs con cristal teleprompter
- Instalable como app (PWA)

## Arquitectura

- **Frontend**: HTML/CSS/JS sin dependencias ni build.
- **Backend**: API mínima en FastAPI (`backend/`) con SQLite como base de datos. El contenido de los guiones vive solo ahí, nunca en el repositorio.

## Uso local

Backend (puerto 8420):

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8420
```

Frontend (otra terminal, puerto 5500):

```bash
python3 -m http.server 5500
```

Abre `http://localhost:5500`.

> La grabación de cámara requiere HTTPS o `localhost` por restricciones del navegador.
> El frontend busca la API en el puerto 8420 del mismo host desde el que se accede a la página.
