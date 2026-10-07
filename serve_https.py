#!/usr/bin/env python3
"""Servidor del frontend: estáticos + proxy de /api al backend.

Sirve por HTTP (puerto 8080 por defecto) y, si hay certificado en certs/,
también por HTTPS (puerto 8090 por defecto). La cámara (getUserMedia) solo
funciona en HTTPS o localhost; el resto de la app funciona por HTTP.

Uso: serve_https.py [puerto_https] [puerto_http]
Variable BACKEND_URL (por defecto http://127.0.0.1:8420).
"""
import http.client
import http.server
import os
import ssl
import sys
import threading
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).parent
CERT = ROOT / "certs" / "cert.pem"
KEY = ROOT / "certs" / "key.pem"
BACKEND = urlsplit(os.environ.get("BACKEND_URL", "http://127.0.0.1:8420"))

os.chdir(ROOT)

https_port = int(sys.argv[1]) if len(sys.argv) > 1 else 8090
http_port = int(sys.argv[2]) if len(sys.argv) > 2 else 8080

HOP_BY_HOP = {"connection", "keep-alive", "transfer-encoding", "te", "upgrade",
              "proxy-authenticate", "proxy-authorization", "trailers", "host"}


class Handler(http.server.SimpleHTTPRequestHandler):
    # HTTP/1.1 (con Content-Length) es necesario para que el navegador
    # pueda registrar el Service Worker correctamente sobre TLS.
    protocol_version = "HTTP/1.1"

    def _proxy(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None
        headers = {k: v for k, v in self.headers.items() if k.lower() not in HOP_BY_HOP}
        try:
            conn = http.client.HTTPConnection(BACKEND.hostname, BACKEND.port, timeout=30)
            conn.request(self.command, self.path, body=body, headers=headers)
            resp = conn.getresponse()
            data = resp.read()
        except OSError:
            data = b'{"detail":"Backend no disponible"}'
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        self.send_response(resp.status)
        for k, v in resp.getheaders():
            if k.lower() not in HOP_BY_HOP and k.lower() != "content-length":
                self.send_header(k, v)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)
        conn.close()

    def _dispatch(self, static):
        if self.path.startswith("/api/"):
            self._proxy()
        else:
            static()

    def do_GET(self):
        self._dispatch(super().do_GET)

    def do_HEAD(self):
        self._dispatch(super().do_HEAD)

    def do_POST(self):
        self._proxy()

    do_PUT = do_DELETE = do_PATCH = do_OPTIONS = do_POST


def make(port):
    return http.server.ThreadingHTTPServer(("0.0.0.0", port), Handler)


http_server = make(http_port)
print(f"HTTP  en http://0.0.0.0:{http_port}")
threading.Thread(target=http_server.serve_forever, daemon=True).start()

if CERT.exists() and KEY.exists():
    server = make(https_port)
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(certfile=str(CERT), keyfile=str(KEY))
    server.socket = ctx.wrap_socket(server.socket, server_side=True)
    print(f"HTTPS en https://0.0.0.0:{https_port}")
    server.serve_forever()
else:
    print("Sin certs/: solo HTTP (la cámara no funcionará fuera de localhost)")
    http_server.serve_forever()
