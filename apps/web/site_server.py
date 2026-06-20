from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os

PORT = int(os.environ.get('PORT', '8084'))
ROOT = Path(__file__).resolve().parent
OPEN_HTML = {'', '/', 'index.html', 'admin.html', 'matricula-publica.html', 'student-login.html', 'home.html'}

class SiteHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        name = path.split('?', 1)[0].split('#', 1)[0].lstrip('/') or 'index.html'
        return str(ROOT / name)

    def do_GET(self):
        name = self.path.split('?', 1)[0].split('#', 1)[0].lstrip('/') or 'index.html'
        cookie = self.headers.get('Cookie', '')
        allowed = name in OPEN_HTML or not name.endswith('.html') or 'academiaPortal=1' in cookie
        if not allowed:
            self.send_response(302)
            self.send_header('Location', '/admin.html')
            self.end_headers()
            return
        return super().do_GET()

if __name__ == '__main__':
    os.chdir(ROOT)
    ThreadingHTTPServer(('0.0.0.0', PORT), SiteHandler).serve_forever()
