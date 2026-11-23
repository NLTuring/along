"""Read-only DNS/TLS/SSH capability checks; no credentials or remote commands."""
import importlib.util
import json
import socket
import ssl
from pathlib import Path

for name in ['tokennext.top', 'along.tokennext.top', 'openai.goldgom.top']:
    try:
        addresses = sorted({item[4][0] for item in socket.getaddrinfo(name, 443, type=socket.SOCK_STREAM)})
        print(json.dumps({'name': name, 'addresses': addresses}), flush=True)
    except OSError as error:
        print(json.dumps({'name': name, 'error': str(error)}), flush=True)
print(json.dumps({'paramikoAvailable': importlib.util.find_spec('paramiko') is not None,
                  'knownHostsExists': (Path.home() / '.ssh' / 'known_hosts').is_file()}), flush=True)
try:
    with socket.create_connection(('tokennext.top', 443), timeout=12) as connection:
        with ssl.create_default_context().wrap_socket(connection, server_hostname='tokennext.top') as tls:
            certificate = tls.getpeercert()
            tls.sendall(b'HEAD / HTTP/1.1\r\nHost: tokennext.top\r\nConnection: close\r\n\r\n')
            headers = tls.recv(8192).split(b'\r\n\r\n', 1)[0].decode('latin-1')
            allowed = [line for line in headers.split('\r\n') if line.startswith('HTTP/') or line.lower().startswith(('server:', 'location:', 'content-type:'))]
            print(json.dumps({'tls': 'verified', 'names': certificate.get('subjectAltName'),
                              'expires': certificate.get('notAfter'), 'headers': allowed}), flush=True)
except (OSError, ssl.SSLError) as error:
    print(json.dumps({'tls': 'unverified', 'error': str(error)}), flush=True)
