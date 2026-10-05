#!/usr/bin/env python3
"""Servidor estático HTTPS para el frontend, usando el certificado autofirmado
en certs/. Necesario porque la cámara (getUserMedia) solo funciona en un
contexto seguro: localhost o HTTPS, nunca HTTP salvo en localhost.
"""
import http.server
import os
import ssl
import sys
from pathlib import Path

ROOT = Path(__file__).parent
CERT = ROOT / "certs" / "cert.pem"
KEY = ROOT / "certs" / "key.pem"

os.chdir(ROOT)

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8090

if not CERT.exists() or not KEY.exists():
    print("Falta el certificado en certs/cert.pem y certs/key.pem")
    sys.exit(1)

class Handler(http.server.SimpleHTTPRequestHandler):
    # HTTP/1.1 (con Content-Length) es necesario para que el navegador
    # pueda registrar el Service Worker correctamente sobre TLS.
    protocol_version = "HTTP/1.1"


server = http.server.ThreadingHTTPServer(("0.0.0.0", port), Handler)

ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(certfile=str(CERT), keyfile=str(KEY))
server.socket = ctx.wrap_socket(server.socket, server_side=True)

print(f"Sirviendo HTTPS en https://0.0.0.0:{port} (cwd: {ROOT})")
server.serve_forever()
