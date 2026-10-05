<p align="center">
  <img src="logo.png" alt="Prompter" width="120">
</p>

<h1 align="center">Prompter</h1>

<p align="center">Teleprompter ligero, sin dependencias, con grabación de cámara integrada.</p>

## Funciones

- Scroll automático con velocidad y tamaño de texto ajustables
- Biblioteca de guiones (crear, editar, eliminar)
- Grabación de cámara y micrófono mientras lees el guion
- Espejo de texto para rigs con cristal teleprompter
- Instalable como app (PWA), funciona sin conexión

## Uso local

```bash
git clone git@github.com:Maalfer/Prompter.git
cd Prompter
python3 -m http.server 8000
```

Abre `http://localhost:8000`.

> La grabación de cámara requiere HTTPS o `localhost` por restricciones del navegador.

## Despliegue

App estática sin build ni backend: cualquier hosting (GitHub Pages, Netlify, Vercel, nginx...) la sirve tal cual.
